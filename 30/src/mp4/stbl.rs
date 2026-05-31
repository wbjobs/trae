use crate::error::{Mp4SeiError, Result};
use crate::mp4::boxes::Box;
use byteorder::{BigEndian, ReadBytesExt};
use std::io::{Read, Seek, SeekFrom};

/// Sample information
#[derive(Debug, Clone)]
pub struct SampleInfo {
    pub size: u32,
    pub duration: u32,
    pub pts: u64,
    pub dts: u64,
    pub is_keyframe: bool,
    pub offset_in_mdat: u64,
}

/// STBL Box - Sample Table
#[derive(Debug, Clone)]
pub struct StblBox {
    pub stsd: StsdBox,
    pub stts: SttsBox,
    pub stss: Option<StssBox>,
    pub stsc: StscBox,
    pub stsz: StszBox,
    pub stco: StcoBox,
    pub samples: Vec<SampleInfo>,
}

impl StblBox {
    pub fn parse<R: Read + Seek>(reader: &mut R, size: u64) -> Result<Self> {
        let end_pos = reader.stream_position()? + size;
        let mut stsd = None;
        let mut stts = None;
        let mut stss = None;
        let mut stsc = None;
        let mut stsz = None;
        let mut stco = None;

        while reader.stream_position()? < end_pos {
            let b = Box::parse(reader)?;
            match &b.box_type {
                b"stsd" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    stsd = Some(StsdBox::parse(&mut data, b.data.len() as u64)?);
                }
                b"stts" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    stts = Some(SttsBox::parse(&mut data)?);
                }
                b"stss" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    stss = Some(StssBox::parse(&mut data)?);
                }
                b"stsc" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    stsc = Some(StscBox::parse(&mut data)?);
                }
                b"stsz" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    stsz = Some(StszBox::parse(&mut data)?);
                }
                b"stco" | b"co64" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    stco = Some(StcoBox::parse(&mut data, &b.box_type)?);
                }
                _ => {}
            }
        }

        if stsd.is_none() {
            return Err(Mp4SeiError::BoxNotFound("stsd".to_string()));
        }
        if stts.is_none() {
            return Err(Mp4SeiError::BoxNotFound("stts".to_string()));
        }
        if stsc.is_none() {
            return Err(Mp4SeiError::BoxNotFound("stsc".to_string()));
        }
        if stsz.is_none() {
            return Err(Mp4SeiError::BoxNotFound("stsz".to_string()));
        }
        if stco.is_none() {
            return Err(Mp4SeiError::BoxNotFound("stco".to_string()));
        }

        let mut stbl = Self {
            stsd: stsd.unwrap(),
            stts: stts.unwrap(),
            stss,
            stsc: stsc.unwrap(),
            stsz: stsz.unwrap(),
            stco: stco.unwrap(),
            samples: Vec::new(),
        };

        stbl.build_samples()?;
        Ok(stbl)
    }

    fn build_samples(&mut self) -> Result<()> {
        let sample_count = self.stsz.sample_count as usize;
        let mut samples = Vec::with_capacity(sample_count);

        let mut timestamps = Vec::with_capacity(sample_count);
        let mut current_time: u64 = 0;
        for entry in &self.stts.entries {
            for _ in 0..entry.sample_count {
                timestamps.push(current_time);
                current_time += entry.sample_delta as u64;
            }
        }

        let mut sample_idx = 0;
        let mut chunk_idx = 0;
        while sample_idx < sample_count && chunk_idx < self.stco.offsets.len() {
            let samples_in_chunk = self.stsc.get_samples_in_chunk(chunk_idx as u32 + 1);
            let chunk_offset = self.stco.offsets[chunk_idx];

            let mut offset_in_chunk: u64 = 0;
            for _ in 0..samples_in_chunk {
                if sample_idx >= sample_count {
                    break;
                }
                let size = self.stsz.get_sample_size(sample_idx as u32);
                let is_keyframe = self
                    .stss
                    .as_ref()
                    .map(|s| s.is_keyframe(sample_idx as u32 + 1))
                    .unwrap_or(true);
                let pts = timestamps.get(sample_idx).copied().unwrap_or(0);

                samples.push(SampleInfo {
                    size,
                    duration: 0,
                    pts,
                    dts: pts,
                    is_keyframe,
                    offset_in_mdat: chunk_offset + offset_in_chunk,
                });

                offset_in_chunk += size as u64;
                sample_idx += 1;
            }
            chunk_idx += 1;
        }

        for i in 0..samples.len() {
            let next_pts = samples
                .get(i + 1)
                .map(|s| s.pts)
                .unwrap_or(samples[i].pts);
            samples[i].duration = (next_pts - samples[i].pts) as u32;
        }

        self.samples = samples;
        Ok(())
    }

    pub fn sample_count(&self) -> usize {
        self.samples.len()
    }

    pub fn keyframe_count(&self) -> usize {
        self.samples.iter().filter(|s| s.is_keyframe).count()
    }
}

/// STSD Box - Sample Description
#[derive(Debug, Clone)]
pub struct StsdBox {
    pub entries: Vec<StsdEntry>,
}

#[derive(Debug, Clone)]
pub enum StsdEntry {
    Avc1(Avc1Box),
    Hvc1(Hvc1Box),
    Other([u8; 4]),
}

impl StsdBox {
    pub fn parse<R: Read + Seek>(reader: &mut R, size: u64) -> Result<Self> {
        let end_pos = reader.stream_position()? + size;
        let _version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;
        let entry_count = reader.read_u32::<BigEndian>()?;
        let mut entries = Vec::with_capacity(entry_count as usize);

        while reader.stream_position()? < end_pos {
            let b = Box::parse(reader)?;
            let entry = match &b.box_type {
                b"avc1" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    StsdEntry::Avc1(Avc1Box::parse(&mut data, b.data.len() as u64)?)
                }
                b"hvc1" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    StsdEntry::Hvc1(Hvc1Box::parse(&mut data, b.data.len() as u64)?)
                }
                _ => StsdEntry::Other(b.box_type),
            };
            entries.push(entry);
        }

        Ok(Self { entries })
    }

    pub fn get_codec(&self) -> Option<&[u8; 4]> {
        self.entries.iter().find_map(|e| match e {
            StsdEntry::Avc1(_) => Some(b"avc1"),
            StsdEntry::Hvc1(_) => Some(b"hvc1"),
            StsdEntry::Other(t) => Some(t),
        })
    }

    pub fn get_parameter_sets(&self) -> Result<Vec<Vec<u8>>> {
        for entry in &self.entries {
            match entry {
                StsdEntry::Avc1(avc1) => {
                    if let Some(avcc) = &avc1.avcc {
                        return Ok(avcc.get_parameter_sets());
                    }
                }
                StsdEntry::Hvc1(hvc1) => {
                    if let Some(hvcc) = &hvc1.hvcc {
                        return Ok(hvcc.get_parameter_sets());
                    }
                }
                _ => {}
            }
        }
        Err(Mp4SeiError::UnsupportedCodec(
            "No supported parameter sets found".to_string(),
        ))
    }

    pub fn get_nalu_length_size(&self) -> Option<u8> {
        for entry in &self.entries {
            match entry {
                StsdEntry::Avc1(avc1) => {
                    if let Some(avcc) = &avc1.avcc {
                        return Some(avcc.length_size_minus_one + 1);
                    }
                }
                StsdEntry::Hvc1(hvc1) => {
                    if let Some(hvcc) = &hvc1.hvcc {
                        return Some(hvcc.length_size_minus_one + 1);
                    }
                }
                _ => {}
            }
        }
        None
    }
}

/// AVC1 Box - H.264 Video Sample Entry
#[derive(Debug, Clone)]
pub struct Avc1Box {
    pub width: u16,
    pub height: u16,
    pub avcc: Option<AvccBox>,
}

impl Avc1Box {
    pub fn parse<R: Read + Seek>(reader: &mut R, size: u64) -> Result<Self> {
        let end_pos = reader.stream_position()? + size;
        let _reserved = reader.read_u32::<BigEndian>()?;
        let _reserved2 = reader.read_u16::<BigEndian>()?;
        let _reserved3 = reader.read_u16::<BigEndian>()?;
        for _ in 0..3 {
            let _ = reader.read_u32::<BigEndian>()?;
        }
        let width = reader.read_u16::<BigEndian>()?;
        let height = reader.read_u16::<BigEndian>()?;
        let _horiz_res = reader.read_u32::<BigEndian>()?;
        let _vert_res = reader.read_u32::<BigEndian>()?;
        let _reserved4 = reader.read_u32::<BigEndian>()?;
        let _frame_count = reader.read_u16::<BigEndian>()?;
        let mut _compressor = [0u8; 32];
        reader.read_exact(&mut _compressor)?;
        let _depth = reader.read_u16::<BigEndian>()?;
        let _pre_defined = reader.read_i16::<BigEndian>()?;

        let mut avcc = None;
        while reader.stream_position()? < end_pos {
            let b = Box::parse(reader)?;
            if b.box_type == *b"avcC" {
                let mut data = std::io::Cursor::new(&b.data);
                avcc = Some(AvccBox::parse(&mut data)?);
            }
        }

        Ok(Self { width, height, avcc })
    }
}

/// AVCC Box - AVC Configuration
#[derive(Debug, Clone)]
pub struct AvccBox {
    pub configuration_version: u8,
    pub profile: u8,
    pub profile_compatibility: u8,
    pub level: u8,
    pub length_size_minus_one: u8,
    pub sps: Vec<Vec<u8>>,
    pub pps: Vec<Vec<u8>>,
}

impl AvccBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let configuration_version = reader.read_u8()?;
        let profile = reader.read_u8()?;
        let profile_compatibility = reader.read_u8()?;
        let level = reader.read_u8()?;
        let length_size_minus_one = reader.read_u8()? & 0x03;
        let num_sps = reader.read_u8()? & 0x1F;
        let mut sps = Vec::with_capacity(num_sps as usize);
        for _ in 0..num_sps {
            let length = reader.read_u16::<BigEndian>()?;
            let mut data = vec![0u8; length as usize];
            reader.read_exact(&mut data)?;
            sps.push(data);
        }
        let num_pps = reader.read_u8()?;
        let mut pps = Vec::with_capacity(num_pps as usize);
        for _ in 0..num_pps {
            let length = reader.read_u16::<BigEndian>()?;
            let mut data = vec![0u8; length as usize];
            reader.read_exact(&mut data)?;
            pps.push(data);
        }

        Ok(Self {
            configuration_version,
            profile,
            profile_compatibility,
            level,
            length_size_minus_one,
            sps,
            pps,
        })
    }

    pub fn get_parameter_sets(&self) -> Vec<Vec<u8>> {
        let mut result = Vec::new();
        result.extend(self.sps.iter().cloned());
        result.extend(self.pps.iter().cloned());
        result
    }
}

/// HVC1 Box - H.265 Video Sample Entry
#[derive(Debug, Clone)]
pub struct Hvc1Box {
    pub width: u16,
    pub height: u16,
    pub hvcc: Option<HvccBox>,
}

impl Hvc1Box {
    pub fn parse<R: Read + Seek>(reader: &mut R, size: u64) -> Result<Self> {
        let end_pos = reader.stream_position()? + size;
        let _reserved = reader.read_u32::<BigEndian>()?;
        let _reserved2 = reader.read_u16::<BigEndian>()?;
        let _reserved3 = reader.read_u16::<BigEndian>()?;
        for _ in 0..3 {
            let _ = reader.read_u32::<BigEndian>()?;
        }
        let width = reader.read_u16::<BigEndian>()?;
        let height = reader.read_u16::<BigEndian>()?;
        let _horiz_res = reader.read_u32::<BigEndian>()?;
        let _vert_res = reader.read_u32::<BigEndian>()?;
        let _reserved4 = reader.read_u32::<BigEndian>()?;
        let _frame_count = reader.read_u16::<BigEndian>()?;
        let mut _compressor = [0u8; 32];
        reader.read_exact(&mut _compressor)?;
        let _depth = reader.read_u16::<BigEndian>()?;
        let _pre_defined = reader.read_i16::<BigEndian>()?;

        let mut hvcc = None;
        while reader.stream_position()? < end_pos {
            let b = Box::parse(reader)?;
            if b.box_type == *b"hvcC" {
                let mut data = std::io::Cursor::new(&b.data);
                hvcc = Some(HvccBox::parse(&mut data)?);
            }
        }

        Ok(Self { width, height, hvcc })
    }
}

/// HVCC Box - HEVC Configuration
#[derive(Debug, Clone)]
pub struct HvccBox {
    pub configuration_version: u8,
    pub general_profile_space: u8,
    pub general_profile_idc: u8,
    pub general_profile_compatibility: u32,
    pub general_level_idc: u8,
    pub length_size_minus_one: u8,
    pub vps: Vec<Vec<u8>>,
    pub sps: Vec<Vec<u8>>,
    pub pps: Vec<Vec<u8>>,
}

impl HvccBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let configuration_version = reader.read_u8()?;
        let byte2 = reader.read_u8()?;
        let general_profile_space = (byte2 >> 6) & 0x03;
        let general_tier_flag = (byte2 >> 5) & 0x01;
        let general_profile_idc = byte2 & 0x1F;
        let general_profile_compatibility = reader.read_u32::<BigEndian>()?;
        let mut _general_constraint = [0u8; 6];
        reader.read_exact(&mut _general_constraint)?;
        let general_level_idc = reader.read_u8()?;
        let _min_spatial_segmentation = reader.read_u16::<BigEndian>()?;
        let _parallelism = reader.read_u8()?;
        let _chroma_format = reader.read_u8()? & 0x03;
        let _bit_depth_luma = (reader.read_u8()? & 0x07) + 8;
        let _bit_depth_chroma = (reader.read_u8()? & 0x07) + 8;
        let _avg_frame_rate = reader.read_u16::<BigEndian>()?;
        let byte14 = reader.read_u8()?;
        let _constant_frame_rate = (byte14 >> 6) & 0x03;
        let _num_temporal_layers = (byte14 >> 3) & 0x07;
        let _temporal_id_nested = (byte14 >> 2) & 0x01;
        let length_size_minus_one = byte14 & 0x03;
        let num_of_arrays = reader.read_u8()?;

        let mut vps = Vec::new();
        let mut sps = Vec::new();
        let mut pps = Vec::new();

        for _ in 0..num_of_arrays {
            let nal_unit_type = reader.read_u8()? & 0x3F;
            let num_nals = reader.read_u16::<BigEndian>()?;
            for _ in 0..num_nals {
                let length = reader.read_u16::<BigEndian>()?;
                let mut data = vec![0u8; length as usize];
                reader.read_exact(&mut data)?;
                match nal_unit_type {
                    32 => vps.push(data),
                    33 => sps.push(data),
                    34 => pps.push(data),
                    _ => {}
                }
            }
        }

        Ok(Self {
            configuration_version,
            general_profile_space,
            general_profile_idc,
            general_profile_compatibility,
            general_level_idc,
            length_size_minus_one,
            vps,
            sps,
            pps,
        })
    }

    pub fn get_parameter_sets(&self) -> Vec<Vec<u8>> {
        let mut result = Vec::new();
        result.extend(self.vps.iter().cloned());
        result.extend(self.sps.iter().cloned());
        result.extend(self.pps.iter().cloned());
        result
    }
}

/// STTS Box - Decoding Time to Sample
#[derive(Debug, Clone)]
pub struct SttsBox {
    pub entries: Vec<SttsEntry>,
}

#[derive(Debug, Clone)]
pub struct SttsEntry {
    pub sample_count: u32,
    pub sample_delta: u32,
}

impl SttsBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let _version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;
        let entry_count = reader.read_u32::<BigEndian>()?;
        let mut entries = Vec::with_capacity(entry_count as usize);
        for _ in 0..entry_count {
            entries.push(SttsEntry {
                sample_count: reader.read_u32::<BigEndian>()?,
                sample_delta: reader.read_u32::<BigEndian>()?,
            });
        }
        Ok(Self { entries })
    }
}

/// STSS Box - Sync Sample
#[derive(Debug, Clone)]
pub struct StssBox {
    pub entries: Vec<u32>,
}

impl StssBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let _version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;
        let entry_count = reader.read_u32::<BigEndian>()?;
        let mut entries = Vec::with_capacity(entry_count as usize);
        for _ in 0..entry_count {
            entries.push(reader.read_u32::<BigEndian>()?);
        }
        Ok(Self { entries })
    }

    pub fn is_keyframe(&self, sample_number: u32) -> bool {
        self.entries.binary_search(&sample_number).is_ok()
    }
}

/// STSC Box - Sample to Chunk
#[derive(Debug, Clone)]
pub struct StscBox {
    pub entries: Vec<StscEntry>,
}

#[derive(Debug, Clone)]
pub struct StscEntry {
    pub first_chunk: u32,
    pub samples_per_chunk: u32,
    pub sample_description_index: u32,
}

impl StscBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let _version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;
        let entry_count = reader.read_u32::<BigEndian>()?;
        let mut entries = Vec::with_capacity(entry_count as usize);
        for _ in 0..entry_count {
            entries.push(StscEntry {
                first_chunk: reader.read_u32::<BigEndian>()?,
                samples_per_chunk: reader.read_u32::<BigEndian>()?,
                sample_description_index: reader.read_u32::<BigEndian>()?,
            });
        }
        Ok(Self { entries })
    }

    pub fn get_samples_in_chunk(&self, chunk_number: u32) -> u32 {
        for i in (0..self.entries.len()).rev() {
            if chunk_number >= self.entries[i].first_chunk {
                return self.entries[i].samples_per_chunk;
            }
        }
        self.entries[0].samples_per_chunk
    }
}

/// STSZ Box - Sample Size
#[derive(Debug, Clone)]
pub struct StszBox {
    pub sample_size: u32,
    pub sample_count: u32,
    pub sizes: Vec<u32>,
}

impl StszBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let _version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;
        let sample_size = reader.read_u32::<BigEndian>()?;
        let sample_count = reader.read_u32::<BigEndian>()?;
        let mut sizes = Vec::new();
        if sample_size == 0 {
            sizes.reserve(sample_count as usize);
            for _ in 0..sample_count {
                sizes.push(reader.read_u32::<BigEndian>()?);
            }
        }
        Ok(Self {
            sample_size,
            sample_count,
            sizes,
        })
    }

    pub fn get_sample_size(&self, sample_index: u32) -> u32 {
        if self.sample_size != 0 {
            self.sample_size
        } else {
            self.sizes.get(sample_index as usize).copied().unwrap_or(0)
        }
    }
}

/// STCO Box - Chunk Offset
#[derive(Debug, Clone)]
pub struct StcoBox {
    pub offsets: Vec<u64>,
}

impl StcoBox {
    pub fn parse<R: Read>(reader: &mut R, box_type: &[u8; 4]) -> Result<Self> {
        let _version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;
        let entry_count = reader.read_u32::<BigEndian>()?;
        let mut offsets = Vec::with_capacity(entry_count as usize);
        if box_type == b"co64" {
            for _ in 0..entry_count {
                offsets.push(reader.read_u64::<BigEndian>()?);
            }
        } else {
            for _ in 0..entry_count {
                offsets.push(reader.read_u32::<BigEndian>()? as u64);
            }
        }
        Ok(Self { offsets })
    }
}
