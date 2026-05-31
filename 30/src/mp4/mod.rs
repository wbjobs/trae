use crate::error::{Mp4SeiError, Result};
use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub mod boxes;
pub mod stbl;

use boxes::*;
use stbl::*;

/// Represents a parsed MP4 file
pub struct Mp4File {
    pub file_path: std::path::PathBuf,
    pub file_size: u64,
    pub boxes: Vec<Box>,
    pub moov: Option<MoovBox>,
    pub mdat: Option<MdatBox>,
}

impl Mp4File {
    /// Parse an MP4 file from the given path
    pub fn parse(path: &Path) -> Result<Self> {
        let mut file = File::open(path)?;
        let file_size = file.seek(SeekFrom::End(0))?;
        file.seek(SeekFrom::Start(0))?;

        let mut boxes = Vec::new();
        let mut moov = None;
        let mut mdat = None;

        while file.stream_position()? < file_size {
            let b = Box::parse(&mut file)?;
            if b.box_type == *b"moov" {
                let mut data = std::io::Cursor::new(&b.data);
                moov = Some(MoovBox::parse(&mut data, b.data.len() as u64)?);
            } else if b.box_type == *b"mdat" {
                mdat = Some(MdatBox {
                    offset: b.offset,
                    size: b.size,
                    header_size: b.header_size,
                });
            }
            boxes.push(b);
        }

        if moov.is_none() {
            return Err(Mp4SeiError::BoxNotFound("moov".to_string()));
        }
        if mdat.is_none() {
            return Err(Mp4SeiError::BoxNotFound("mdat".to_string()));
        }

        Ok(Self {
            file_path: path.to_path_buf(),
            file_size,
            boxes,
            moov,
            mdat,
        })
    }

    /// Get the video track information
    pub fn get_video_track(&self) -> Option<&TrakBox> {
        self.moov.as_ref()?.traks.iter().find(|t| t.is_video())
    }

    /// Get the codec type (avc1 or hvc1)
    pub fn get_codec(&self) -> Option<&[u8; 4]> {
        let trak = self.get_video_track()?;
        trak.mdia.minf.stbl.stsd.get_codec()
    }

    /// Extract raw H.264/H.265 bitstream from mdat
    pub fn extract_bitstream(&self) -> Result<Vec<u8>> {
        let trak = self
            .get_video_track()
            .ok_or_else(|| Mp4SeiError::BoxNotFound("video track".to_string()))?;
        let stbl = &trak.mdia.minf.stbl;
        let mdat = self
            .mdat
            .as_ref()
            .ok_or_else(|| Mp4SeiError::BoxNotFound("mdat".to_string()))?;

        let mut file = File::open(&self.file_path)?;
        let mut bitstream = Vec::new();

        for sample in &stbl.samples {
            let offset = mdat.data_offset() + sample.offset_in_mdat;
            file.seek(SeekFrom::Start(offset))?;
            let mut sample_data = vec![0u8; sample.size as usize];
            file.read_exact(&mut sample_data)?;
            bitstream.extend_from_slice(&sample_data);
        }

        Ok(bitstream)
    }

    /// Get SPS/PPS NAL units for H.264 or VPS/SPS/PPS for H.265
    pub fn get_parameter_sets(&self) -> Result<Vec<Vec<u8>>> {
        let trak = self
            .get_video_track()
            .ok_or_else(|| Mp4SeiError::BoxNotFound("video track".to_string()))?;
        let stsd = &trak.mdia.minf.stbl.stsd;
        stsd.get_parameter_sets()
    }
}

impl std::fmt::Display for Mp4File {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "MP4 File: {}", self.file_path.display())?;
        writeln!(f, "File size: {} bytes", self.file_size)?;
        writeln!(f, "Top-level boxes:")?;
        for b in &self.boxes {
            writeln!(
                f,
                "  [{}] offset={}, size={}",
                String::from_utf8_lossy(&b.box_type),
                b.offset,
                b.size
            )?;
        }

        if let Some(moov) = &self.moov {
            writeln!(f, "\nTracks:")?;
            for (i, trak) in moov.traks.iter().enumerate() {
                writeln!(f, "  Track {}:", i)?;
                writeln!(
                    f,
                    "    Type: {}",
                    if trak.is_video() {
                        "Video"
                    } else if trak.is_audio() {
                        "Audio"
                    } else {
                        "Other"
                    }
                )?;
                writeln!(f, "    Duration: {}", trak.duration())?;
                writeln!(f, "    Timescale: {}", trak.timescale())?;

                if trak.is_video() {
                    let stbl = &trak.mdia.minf.stbl;
                    writeln!(
                        f,
                        "    Codec: {}",
                        String::from_utf8_lossy(
                            stbl.stsd.get_codec().unwrap_or(&[b'u', b'n', b'k', b'n'])
                        )
                    )?;
                    writeln!(f, "    Samples: {}", stbl.sample_count());
                    writeln!(f, "    Keyframes: {}", stbl.keyframe_count());
                }
            }
        }

        if let Some(mdat) = &self.mdat {
            writeln!(f, "\nMDAT:")?;
            writeln!(f, "  Data offset: {}", mdat.data_offset())?;
            writeln!(f, "  Data size: {}", mdat.data_size())?;
        }

        Ok(())
    }
}

/// Helper to read a box header
fn read_box_header<R: Read + Seek>(reader: &mut R) -> Result<(u64, [u8; 4], u64)> {
    let start_offset = reader.stream_position()?;
    let size32 = reader.read_u32::<BigEndian>()?;
    let mut box_type = [0u8; 4];
    reader.read_exact(&mut box_type)?;

    let (size, header_size) = if size32 == 1 {
        let size64 = reader.read_u64::<BigEndian>()?;
        (size64, 16u64)
    } else if size32 == 0 {
        let end = reader.seek(SeekFrom::End(0))?;
        (end - start_offset, 8u64)
    } else {
        (size32 as u64, 8u64)
    };

    Ok((size, box_type, header_size))
}

/// Helper to write a box header
fn write_box_header<W: std::io::Write>(
    writer: &mut W,
    box_type: &[u8; 4],
    data_size: u64,
) -> Result<()> {
    let total_size = data_size + 8;
    if total_size > u32::MAX as u64 {
        writer.write_u32::<BigEndian>(1)?;
        writer.write_all(box_type)?;
        writer.write_u64::<BigEndian>(total_size)?;
    } else {
        writer.write_u32::<BigEndian>(total_size as u32)?;
        writer.write_all(box_type)?;
    }
    Ok(())
}
