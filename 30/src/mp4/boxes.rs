use crate::error::{Mp4SeiError, Result};
use crate::mp4::stbl::StblBox;
use byteorder::{BigEndian, ReadBytesExt};
use std::io::{Read, Seek, SeekFrom};

/// Generic MP4 Box
#[derive(Debug, Clone)]
pub struct Box {
    pub offset: u64,
    pub size: u64,
    pub header_size: u64,
    pub box_type: [u8; 4],
    pub data: Vec<u8>,
}

impl Box {
    pub fn parse<R: Read + Seek>(reader: &mut R) -> Result<Self> {
        let offset = reader.stream_position()?;
        let (size, box_type, header_size) = super::read_box_header(reader)?;
        let data_size = (size - header_size) as usize;
        let mut data = vec![0u8; data_size];
        reader.read_exact(&mut data)?;

        Ok(Self {
            offset,
            size,
            header_size,
            box_type,
            data,
        })
    }

    pub fn box_type_str(&self) -> String {
        String::from_utf8_lossy(&self.box_type).to_string()
    }
}

/// MOOV Box - Movie container
#[derive(Debug, Clone)]
pub struct MoovBox {
    pub mvhd: MvhdBox,
    pub traks: Vec<TrakBox>,
}

impl MoovBox {
    pub fn parse<R: Read + Seek>(reader: &mut R, size: u64) -> Result<Self> {
        let end_pos = reader.stream_position()? + size;
        let mut mvhd = None;
        let mut traks = Vec::new();

        while reader.stream_position()? < end_pos {
            let b = Box::parse(reader)?;
            match &b.box_type {
                b"mvhd" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    mvhd = Some(MvhdBox::parse(&mut data)?);
                }
                b"trak" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    traks.push(TrakBox::parse(&mut data, b.data.len() as u64)?);
                }
                _ => {}
            }
        }

        if mvhd.is_none() {
            return Err(Mp4SeiError::BoxNotFound("mvhd".to_string()));
        }
        if traks.is_empty() {
            return Err(Mp4SeiError::BoxNotFound("trak".to_string()));
        }

        Ok(Self {
            mvhd: mvhd.unwrap(),
            traks,
        })
    }
}

/// MVHD Box - Movie Header
#[derive(Debug, Clone)]
pub struct MvhdBox {
    pub version: u8,
    pub creation_time: u64,
    pub modification_time: u64,
    pub timescale: u32,
    pub duration: u64,
}

impl MvhdBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;

        let (creation_time, modification_time, timescale, duration) = if version == 1 {
            (
                reader.read_u64::<BigEndian>()?,
                reader.read_u64::<BigEndian>()?,
                reader.read_u32::<BigEndian>()?,
                reader.read_u64::<BigEndian>()?,
            )
        } else {
            (
                reader.read_u32::<BigEndian>()? as u64,
                reader.read_u32::<BigEndian>()? as u64,
                reader.read_u32::<BigEndian>()?,
                reader.read_u32::<BigEndian>()? as u64,
            )
        };

        Ok(Self {
            version,
            creation_time,
            modification_time,
            timescale,
            duration,
        })
    }
}

/// TRAK Box - Track container
#[derive(Debug, Clone)]
pub struct TrakBox {
    pub tkhd: TkhdBox,
    pub mdia: MdiaBox,
}

impl TrakBox {
    pub fn parse<R: Read + Seek>(reader: &mut R, size: u64) -> Result<Self> {
        let end_pos = reader.stream_position()? + size;
        let mut tkhd = None;
        let mut mdia = None;

        while reader.stream_position()? < end_pos {
            let b = Box::parse(reader)?;
            match &b.box_type {
                b"tkhd" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    tkhd = Some(TkhdBox::parse(&mut data)?);
                }
                b"mdia" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    mdia = Some(MdiaBox::parse(&mut data, b.data.len() as u64)?);
                }
                _ => {}
            }
        }

        if tkhd.is_none() {
            return Err(Mp4SeiError::BoxNotFound("tkhd".to_string()));
        }
        if mdia.is_none() {
            return Err(Mp4SeiError::BoxNotFound("mdia".to_string()));
        }

        Ok(Self {
            tkhd: tkhd.unwrap(),
            mdia: mdia.unwrap(),
        })
    }

    pub fn is_video(&self) -> bool {
        self.mdia.hdlr.handler_type == *b"vide"
    }

    pub fn is_audio(&self) -> bool {
        self.mdia.hdlr.handler_type == *b"soun"
    }

    pub fn duration(&self) -> u64 {
        self.tkhd.duration
    }

    pub fn timescale(&self) -> u32 {
        self.mdia.mdhd.timescale
    }
}

/// TKHD Box - Track Header
#[derive(Debug, Clone)]
pub struct TkhdBox {
    pub version: u8,
    pub track_id: u32,
    pub duration: u64,
    pub width: u32,
    pub height: u32,
}

impl TkhdBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;

        let (creation_time, modification_time, track_id, duration) = if version == 1 {
            (
                reader.read_u64::<BigEndian>()?,
                reader.read_u64::<BigEndian>()?,
                reader.read_u32::<BigEndian>()?,
                reader.read_u64::<BigEndian>()?,
            )
        } else {
            (
                reader.read_u32::<BigEndian>()? as u64,
                reader.read_u32::<BigEndian>()? as u64,
                reader.read_u32::<BigEndian>()?,
                reader.read_u32::<BigEndian>()? as u64,
            )
        };

        let _reserved = reader.read_u32::<BigEndian>()?;
        let _layer = reader.read_u16::<BigEndian>()?;
        let _alternate_group = reader.read_u16::<BigEndian>()?;
        let _volume = reader.read_u16::<BigEndian>()?;
        let _reserved2 = reader.read_u16::<BigEndian>()?;
        for _ in 0..9 {
            let _ = reader.read_u32::<BigEndian>()?;
        }
        let width = reader.read_u32::<BigEndian>()?;
        let height = reader.read_u32::<BigEndian>()?;

        Ok(Self {
            version,
            track_id,
            duration,
            width: width >> 16,
            height: height >> 16,
        })
    }
}

/// MDIA Box - Media container
#[derive(Debug, Clone)]
pub struct MdiaBox {
    pub mdhd: MdhdBox,
    pub hdlr: HdlrBox,
    pub minf: MinfBox,
}

impl MdiaBox {
    pub fn parse<R: Read + Seek>(reader: &mut R, size: u64) -> Result<Self> {
        let end_pos = reader.stream_position()? + size;
        let mut mdhd = None;
        let mut hdlr = None;
        let mut minf = None;

        while reader.stream_position()? < end_pos {
            let b = Box::parse(reader)?;
            match &b.box_type {
                b"mdhd" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    mdhd = Some(MdhdBox::parse(&mut data)?);
                }
                b"hdlr" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    hdlr = Some(HdlrBox::parse(&mut data)?);
                }
                b"minf" => {
                    let mut data = std::io::Cursor::new(&b.data);
                    minf = Some(MinfBox::parse(&mut data, b.data.len() as u64)?);
                }
                _ => {}
            }
        }

        if mdhd.is_none() {
            return Err(Mp4SeiError::BoxNotFound("mdhd".to_string()));
        }
        if hdlr.is_none() {
            return Err(Mp4SeiError::BoxNotFound("hdlr".to_string()));
        }
        if minf.is_none() {
            return Err(Mp4SeiError::BoxNotFound("minf".to_string()));
        }

        Ok(Self {
            mdhd: mdhd.unwrap(),
            hdlr: hdlr.unwrap(),
            minf: minf.unwrap(),
        })
    }
}

/// MDHD Box - Media Header
#[derive(Debug, Clone)]
pub struct MdhdBox {
    pub version: u8,
    pub timescale: u32,
    pub duration: u64,
}

impl MdhdBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;

        let (timescale, duration) = if version == 1 {
            let _creation_time = reader.read_u64::<BigEndian>()?;
            let _modification_time = reader.read_u64::<BigEndian>()?;
            (
                reader.read_u32::<BigEndian>()?,
                reader.read_u64::<BigEndian>()?,
            )
        } else {
            let _creation_time = reader.read_u32::<BigEndian>()?;
            let _modification_time = reader.read_u32::<BigEndian>()?;
            (
                reader.read_u32::<BigEndian>()?,
                reader.read_u32::<BigEndian>()? as u64,
            )
        };

        Ok(Self {
            version,
            timescale,
            duration,
        })
    }
}

/// HDLR Box - Handler Reference
#[derive(Debug, Clone)]
pub struct HdlrBox {
    pub handler_type: [u8; 4],
}

impl HdlrBox {
    pub fn parse<R: Read>(reader: &mut R) -> Result<Self> {
        let _version = reader.read_u8()?;
        let _flags = reader.read_u24::<BigEndian>()?;
        let _pre_defined = reader.read_u32::<BigEndian>()?;
        let mut handler_type = [0u8; 4];
        reader.read_exact(&mut handler_type)?;
        for _ in 0..3 {
            let _ = reader.read_u32::<BigEndian>()?;
        }

        Ok(Self { handler_type })
    }
}

/// MINF Box - Media Information container
#[derive(Debug, Clone)]
pub struct MinfBox {
    pub stbl: StblBox,
}

impl MinfBox {
    pub fn parse<R: Read + Seek>(reader: &mut R, size: u64) -> Result<Self> {
        let end_pos = reader.stream_position()? + size;
        let mut stbl = None;

        while reader.stream_position()? < end_pos {
            let b = Box::parse(reader)?;
            if b.box_type == *b"stbl" {
                let mut data = std::io::Cursor::new(&b.data);
                stbl = Some(StblBox::parse(&mut data, b.data.len() as u64)?);
            }
        }

        if stbl.is_none() {
            return Err(Mp4SeiError::BoxNotFound("stbl".to_string()));
        }

        Ok(Self { stbl: stbl.unwrap() })
    }
}

/// MDAT Box - Media Data
#[derive(Debug, Clone)]
pub struct MdatBox {
    pub offset: u64,
    pub size: u64,
    pub header_size: u64,
}

impl MdatBox {
    pub fn data_offset(&self) -> u64 {
        self.offset + self.header_size
    }

    pub fn data_size(&self) -> u64 {
        self.size - self.header_size
    }
}
