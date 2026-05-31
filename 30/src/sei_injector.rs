use crate::error::{Mp4SeiError, Result};
use crate::h26x;
use crate::mp4::Mp4File;
use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

/// SEI injector for MP4 files
pub struct SeiInjector {
    mp4: Mp4File,
    modified_samples: Vec<ModifiedSample>,
}

struct ModifiedSample {
    new_data: Vec<u8>,
    sample_index: usize,
}

impl SeiInjector {
    /// Create a new SEI injector from an MP4 file
    pub fn new(input_path: &Path) -> Result<Self> {
        let mp4 = Mp4File::parse(input_path)?;

        if mp4.get_codec().is_none() {
            return Err(Mp4SeiError::UnsupportedCodec(
                "No supported video codec found".to_string(),
            ));
        }

        Ok(Self {
            mp4,
            modified_samples: Vec::new(),
        })
    }

    /// Inject SEI data into video samples
    /// if every == 0, inject into every keyframe
    /// if every > 0, inject into every Nth frame
    pub fn inject_sei(&mut self, payload: &[u8], every: u32) -> Result<()> {
        let trak = self
            .mp4
            .get_video_track()
            .ok_or_else(|| Mp4SeiError::BoxNotFound("video track".to_string()))?;
        let stbl = &trak.mdia.minf.stbl;
        let is_h265 = matches!(self.mp4.get_codec(), Some(b"hvc1"));
        let length_size = stbl.stsd.get_nalu_length_size().unwrap_or(4);
        let mdat_data_offset = self.mp4.mdat.as_ref().unwrap().data_offset();

        let mut file = File::open(&self.mp4.file_path)?;
        let mut frame_count = 0;

        for (i, sample) in stbl.samples.iter().enumerate() {
            let should_inject = if every == 0 {
                sample.is_keyframe
            } else {
                frame_count % every == 0
            };

            if should_inject {
                let offset = mdat_data_offset + sample.offset_in_mdat;
                file.seek(SeekFrom::Start(offset))?;
                let mut sample_data = vec![0u8; sample.size as usize];
                file.read_exact(&mut sample_data)?;

                let sei_nalu = h26x::create_sei_nalu(payload, is_h265);
                let mut new_sample_data =
                    Vec::with_capacity(sample.size as usize + sei_nalu.len() + 8);

                write_length_prefix(&mut new_sample_data, sei_nalu.len(), length_size)?;
                new_sample_data.extend_from_slice(&sei_nalu);
                new_sample_data.extend_from_slice(&sample_data);

                self.modified_samples.push(ModifiedSample {
                    new_data: new_sample_data,
                    sample_index: i,
                });
            }
            frame_count += 1;
        }

        Ok(())
    }

    /// Write the modified MP4 file
    pub fn write_to_file(&self, output_path: &Path) -> Result<()> {
        let trak = self
            .mp4
            .get_video_track()
            .ok_or_else(|| Mp4SeiError::BoxNotFound("video track".to_string()))?;
        let stbl = &trak.mdia.minf.stbl;
        let mdat = self.mp4.mdat.as_ref().unwrap();

        let mut new_sizes: Vec<u32> = stbl.samples.iter().map(|s| s.size).collect();
        for modified in &self.modified_samples {
            new_sizes[modified.sample_index] = modified.new_data.len() as u32;
        }

        let mut input_file = File::open(&self.mp4.file_path)?;
        let mut mdat_body_data = Vec::new();
        let mut modified_iter = self.modified_samples.iter().peekable();
        for (i, sample) in stbl.samples.iter().enumerate() {
            if let Some(mod_sample) = modified_iter.peek() {
                if mod_sample.sample_index == i {
                    mdat_body_data.extend_from_slice(&mod_sample.new_data);
                    modified_iter.next();
                    continue;
                }
            }

            let offset = mdat.data_offset() + sample.offset_in_mdat;
            input_file.seek(SeekFrom::Start(offset))?;
            let mut sample_data = vec![0u8; sample.size as usize];
            input_file.read_exact(&mut sample_data)?;
            mdat_body_data.extend_from_slice(&sample_data);
        }

        let mut other_boxes_data = Vec::new();
        for b in &self.mp4.boxes {
            if b.box_type != *b"moov" && b.box_type != *b"mdat" {
                write_box(&mut other_boxes_data, &b.box_type, &b.data)?;
            }
        }

        let mut chunk_internal_offsets = Vec::with_capacity(stbl.stco.offsets.len());
        let mut current_offset: u64 = 0;
        let mut sample_idx = 0;
        let mut chunk_idx = 0;

        while sample_idx < new_sizes.len() && chunk_idx < stbl.stco.offsets.len() {
            chunk_internal_offsets.push(current_offset);
            let samples_in_chunk = stbl.stsc.get_samples_in_chunk(chunk_idx as u32 + 1);
            for _ in 0..samples_in_chunk {
                if sample_idx >= new_sizes.len() {
                    break;
                }
                current_offset += new_sizes[sample_idx] as u64;
                sample_idx += 1;
            }
            chunk_idx += 1;
        }

        let mut output = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(output_path)?;

        output.write_all(&other_boxes_data)?;

        let mdat_header_size = if mdat_body_data.len() as u64 + 8 > u32::MAX as u64 {
            16
        } else {
            8
        };
        let mdat_body_abs_offset =
            other_boxes_data.len() as u64 + mdat_header_size as u64;

        let absolute_chunk_offsets: Vec<u64> = chunk_internal_offsets
            .iter()
            .map(|off| mdat_body_abs_offset + off)
            .collect();

        write_box(&mut output, b"mdat", &mdat_body_data)?;

        let moov_data = self.rebuild_moov_with_offsets(&new_sizes, &absolute_chunk_offsets)?;
        output.write_all(&moov_data)?;

        output.flush()?;
        Ok(())
    }

    fn build_moov(&self, new_sizes: &[u32], chunk_offsets: &[u64]) -> Result<Vec<u8>> {
        self.rebuild_moov_with_offsets(new_sizes, chunk_offsets)
    }

    fn rebuild_moov_with_offsets(&self, new_sizes: &[u32], chunk_offsets: &[u64]) -> Result<Vec<u8>> {
        let mut moov_content = Vec::new();

        let mvhd_data = self.get_original_box_data(b"moov", b"mvhd")?;
        moov_content.extend_from_slice(&mvhd_data);

        for (i, t) in self.mp4.moov.as_ref().unwrap().traks.iter().enumerate() {
            if !t.is_video() {
                let original_data = self.get_original_trak_data(i)?;
                moov_content.extend_from_slice(&original_data);
            } else {
                let new_trak = self.rebuild_video_trak(new_sizes, chunk_offsets)?;
                moov_content.extend_from_slice(&new_trak);
            }
        }

        let mut moov = Vec::new();
        write_box(&mut moov, b"moov", &moov_content)?;
        Ok(moov)
    }

    fn rebuild_video_trak(&self, new_sizes: &[u32], chunk_offsets: &[u64]) -> Result<Vec<u8>> {
        let trak = self.mp4.get_video_track().unwrap();
        let stbl = &trak.mdia.minf.stbl;

        let mut stsz = Vec::new();
        stsz.write_u8(0);
        stsz.write_u24::<BigEndian>(0)?;
        stsz.write_u32::<BigEndian>(0)?;
        stsz.write_u32::<BigEndian>(new_sizes.len() as u32)?;
        for size in new_sizes {
            stsz.write_u32::<BigEndian>(*size)?;
        }
        let mut stsz_box = Vec::new();
        write_box(&mut stsz_box, b"stsz", &stsz)?;

        let use_co64 = *chunk_offsets.last().unwrap_or(&0) > u32::MAX as u64;
        let mut stco_body = Vec::new();
        stco_body.write_u8(0);
        stco_body.write_u24::<BigEndian>(0)?;
        stco_body.write_u32::<BigEndian>(chunk_offsets.len() as u32)?;
        if use_co64 {
            for offset in chunk_offsets {
                stco_body.write_u64::<BigEndian>(*offset)?;
            }
        } else {
            for offset in chunk_offsets {
                stco_body.write_u32::<BigEndian>(*offset as u32)?;
            }
        }
        let mut stco_box = Vec::new();
        let stco_type = if use_co64 { b"co64" } else { b"stco" };
        write_box(&mut stco_box, stco_type, &stco_body)?;

        let tkhd_data = self.get_original_box_data(b"trak", b"tkhd")?;
        let mdia_data = self.rebuild_mdia_with_stbl(&stsz_box, &stco_box)?;

        let mut trak_content = Vec::new();
        trak_content.extend_from_slice(&tkhd_data);
        trak_content.extend_from_slice(&mdia_data);

        let mut trak = Vec::new();
        write_box(&mut trak, b"trak", &trak_content)?;
        Ok(trak)
    }

    fn rebuild_mdia_with_stbl(&self, new_stsz: &[u8], new_stco: &[u8]) -> Result<Vec<u8>> {
        let mdhd_data = self.get_original_box_data(b"mdia", b"mdhd")?;
        let hdlr_data = self.get_original_box_data(b"mdia", b"hdlr")?;

        let vmhd_data = self.get_original_box_data(b"minf", b"vmhd")?;
        let dinf_data = self.get_original_box_data(b"minf", b"dinf")?;

        let stsd_data = self.get_original_box_data(b"stbl", b"stsd")?;
        let stts_data = self.get_original_box_data(b"stbl", b"stts")?;
        let stss_data = self.get_original_box_data(b"stbl", b"stss").ok();
        let stsc_data = self.get_original_box_data(b"stbl", b"stsc")?;

        let mut stbl_content = Vec::new();
        stbl_content.extend_from_slice(&stsd_data);
        stbl_content.extend_from_slice(&stts_data);
        if let Some(stss) = stss_data {
            stbl_content.extend_from_slice(&stss);
        }
        stbl_content.extend_from_slice(&stsc_data);
        stbl_content.extend_from_slice(new_stsz);
        stbl_content.extend_from_slice(new_stco);

        let mut stbl_box = Vec::new();
        write_box(&mut stbl_box, b"stbl", &stbl_content)?;

        let mut minf_content = Vec::new();
        minf_content.extend_from_slice(&vmhd_data);
        minf_content.extend_from_slice(&dinf_data);
        minf_content.extend_from_slice(&stbl_box);

        let mut minf_box = Vec::new();
        write_box(&mut minf_box, b"minf", &minf_content)?;

        let mut mdia_content = Vec::new();
        mdia_content.extend_from_slice(&mdhd_data);
        mdia_content.extend_from_slice(&hdlr_data);
        mdia_content.extend_from_slice(&minf_box);

        let mut mdia_box = Vec::new();
        write_box(&mut mdia_box, b"mdia", &mdia_content)?;
        Ok(mdia_box)
    }

    fn get_original_trak_data(&self, track_index: usize) -> Result<Vec<u8>> {
        let moov_box = self
            .mp4
            .boxes
            .iter()
            .find(|b| b.box_type == *b"moov")
            .ok_or_else(|| Mp4SeiError::BoxNotFound("moov".to_string()))?;

        let mut cursor = std::io::Cursor::new(&moov_box.data);
        let mut found_trak = 0;
        let end = moov_box.data.len() as u64;

        while cursor.position() < end {
            let pos = cursor.position();
            let (size, box_type, _) = super::mp4::read_box_header(&mut cursor)?;

            if box_type == *b"trak" {
                if found_trak == track_index {
                    let mut data = vec![0u8; size as usize];
                    cursor.seek(SeekFrom::Start(pos))?;
                    cursor.read_exact(&mut data)?;
                    return Ok(data);
                }
                found_trak += 1;
            }

            cursor.seek(SeekFrom::Start(pos + size))?;
        }

        Err(Mp4SeiError::BoxNotFound("trak".to_string()))
    }

    fn get_original_box_data(&self, parent_type: &[u8; 4], box_type: &[u8; 4]) -> Result<Vec<u8>> {
        for b in &self.mp4.boxes {
            if b.box_type == *parent_type {
                let mut cursor = std::io::Cursor::new(&b.data);
                let end = b.data.len() as u64;
                while cursor.position() < end {
                    let pos = cursor.position();
                    let (size, bt, _) = super::mp4::read_box_header(&mut cursor)?;
                    if bt == *box_type {
                        let mut data = vec![0u8; size as usize];
                        cursor.seek(SeekFrom::Start(pos))?;
                        cursor.read_exact(&mut data)?;
                        return Ok(data);
                    }
                    cursor.seek(SeekFrom::Start(pos + size))?;
                }
            }
        }

        Err(Mp4SeiError::BoxNotFound(String::from_utf8_lossy(box_type).to_string()))
    }

    /// Get the number of SEI injections that will be performed
    pub fn injection_count(&self) -> usize {
        self.modified_samples.len()
    }
}

fn write_length_prefix(buf: &mut Vec<u8>, length: usize, length_size: u8) -> Result<()> {
    match length_size {
        4 => buf.write_u32::<BigEndian>(length as u32)?,
        3 => {
            buf.push(((length as u32) >> 16) as u8);
            buf.push(((length as u32) >> 8) as u8);
            buf.push((length as u32) as u8);
        }
        2 => buf.write_u16::<BigEndian>(length as u16)?,
        1 => buf.push(length as u8),
        _ => {
            return Err(Mp4SeiError::InvalidData(format!(
                "Invalid NALU length size: {}",
                length_size
            )))
        }
    }
    Ok(())
}

fn write_box<W: Write>(writer: &mut W, box_type: &[u8; 4], data: &[u8]) -> Result<()> {
    let total_size = data.len() as u64 + 8;
    if total_size > u32::MAX as u64 {
        writer.write_u32::<BigEndian>(1)?;
        writer.write_all(box_type)?;
        writer.write_u64::<BigEndian>(total_size)?;
    } else {
        writer.write_u32::<BigEndian>(total_size as u32)?;
        writer.write_all(box_type)?;
    }
    writer.write_all(data)?;
    Ok(())
}
