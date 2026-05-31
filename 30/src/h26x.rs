use crate::error::Result;

/// H.264/H.265 NAL unit
#[derive(Debug, Clone)]
pub struct NalUnit {
    pub data: Vec<u8>,
    pub nalu_type: u8,
    pub is_h265: bool,
    pub layer_id: u8,
    pub temporal_id: u8,
}

impl NalUnit {
    /// Parse NAL unit from data (raw NALU data without start code or length prefix)
    pub fn parse(data: &[u8], is_h265: bool) -> Self {
        if is_h265 && data.len() >= 2 {
            let nalu_type = (data[0] >> 1) & 0x3F;
            let layer_id = ((data[0] & 0x01) << 5) | ((data[1] >> 3) & 0x1F);
            let temporal_id = data[1] & 0x07;
            Self {
                data: data.to_vec(),
                nalu_type,
                is_h265: true,
                layer_id,
                temporal_id,
            }
        } else {
            let nalu_type = data[0] & 0x1F;
            Self {
                data: data.to_vec(),
                nalu_type,
                is_h265: false,
                layer_id: 0,
                temporal_id: 0,
            }
        }
    }

    /// Check if this is a VCL (Video Coding Layer) NAL unit
    pub fn is_vcl(&self) -> bool {
        if self.is_h265 {
            self.nalu_type <= 31
        } else {
            self.nalu_type <= 5
        }
    }

    /// Check if this is a non-VCL NAL unit
    pub fn is_non_vcl(&self) -> bool {
        !self.is_vcl()
    }

    /// Check if this is a SEI NAL unit
    pub fn is_sei(&self) -> bool {
        if self.is_h265 {
            self.nalu_type == 39 || self.nalu_type == 40
        } else {
            self.nalu_type == 6
        }
    }

    /// Check if this is a keyframe (IDR or IRAP)
    pub fn is_keyframe(&self) -> bool {
        if self.is_h265 {
            self.nalu_type >= 16 && self.nalu_type <= 23
        } else {
            self.nalu_type == 5
        }
    }

    /// Check if this is an IRAP (Intra Random Access Point) picture for HEVC
    pub fn is_irap(&self) -> bool {
        self.is_h265 && self.nalu_type >= 16 && self.nalu_type <= 23
    }

    /// Get NALU type name
    pub fn type_name(&self) -> &'static str {
        if self.is_h265 {
            match self.nalu_type {
                0 => "TRAIL_N",
                1 => "TRAIL_R",
                2 => "TSA_N",
                3 => "TSA_R",
                4 => "STSA_N",
                5 => "STSA_R",
                6 => "RADL_N",
                7 => "RADL_R",
                8 => "RASL_N",
                9 => "RASL_R",
                10 => "RSV_VCL_N10",
                11 => "RSV_VCL_R11",
                12 => "RSV_VCL_N12",
                13 => "RSV_VCL_R13",
                14 => "RSV_VCL_N14",
                15 => "RSV_VCL_R15",
                16 => "BLA_W_LP",
                17 => "BLA_W_RADL",
                18 => "BLA_N_LP",
                19 => "IDR_W_RADL",
                20 => "IDR_N_LP",
                21 => "CRA_NUT",
                22 => "RSV_IRAP_VCL22",
                23 => "RSV_IRAP_VCL23",
                24..=31 => "RSV_VCL",
                32 => "VPS",
                33 => "SPS",
                34 => "PPS",
                35 => "AUD",
                36 => "EOS",
                37 => "EOB",
                38 => "FD",
                39 => "PREFIX_SEI",
                40 => "SUFFIX_SEI",
                41 => "RSV_NVCL41",
                42 => "RSV_NVCL42",
                43 => "RSV_NVCL43",
                44 => "RSV_NVCL44",
                45 => "RSV_NVCL45",
                46 => "RSV_NVCL46",
                47 => "RSV_NVCL47",
                48..=63 => "UNSPEC",
                _ => "UNKNOWN",
            }
        } else {
            match self.nalu_type {
                1 => "Non-IDR slice",
                2 => "Slice A",
                3 => "Slice B",
                4 => "Slice C",
                5 => "IDR slice",
                6 => "SEI",
                7 => "SPS",
                8 => "PPS",
                9 => "AUD",
                10 => "End of sequence",
                11 => "End of stream",
                12 => "Filler data",
                13..=18 => "Reserved",
                19..=23 => "Reserved",
                24..=31 => "Unspecified",
                _ => "Unknown",
            }
        }
    }
}

/// Split AVCC format data into individual NAL units
pub fn split_nal_units_avcc(data: &[u8], length_size: u8, is_h265: bool) -> Vec<NalUnit> {
    let mut nals = Vec::new();
    let mut offset = 0;
    let length_size = length_size as usize;

    while offset + length_size <= data.len() {
        let mut nal_size: usize = 0;
        for i in 0..length_size {
            nal_size = (nal_size << 8) | data[offset + i] as usize;
        }
        offset += length_size;

        if nal_size == 0 || offset + nal_size > data.len() {
            break;
        }

        let nal_data = &data[offset..offset + nal_size];
        nals.push(NalUnit::parse(nal_data, is_h265));
        offset += nal_size;
    }

    nals
}

/// Create SEI NAL unit with custom payload
pub fn create_sei_nalu(payload: &[u8], is_h265: bool) -> Vec<u8> {
    if is_h265 {
        create_h265_sei_nalu(payload)
    } else {
        create_h264_sei_nalu(payload)
    }
}

/// Create H.264 SEI NAL unit
fn create_h264_sei_nalu(payload: &[u8]) -> Vec<u8> {
    let mut rbsp = Vec::new();
    rbsp.push(5);
    rbsp.push(payload.len() as u8);
    rbsp.extend_from_slice(payload);
    rbsp.push(0x80);

    let mut nalu = Vec::new();
    nalu.push(6);
    nalu.extend(rbsp);
    nalu
}

/// Create H.265 SEI NAL unit (PREFIX_SEI, type 39)
fn create_h265_sei_nalu(payload: &[u8]) -> Vec<u8> {
    let mut rbsp = Vec::new();
    rbsp.push(5);
    rbsp.push(payload.len() as u8);
    rbsp.extend_from_slice(payload);
    rbsp.push(0x80);

    let mut nalu = Vec::new();
    let header: u16 = ((39 as u16) << 9) | 1;
    nalu.push(((header >> 8) & 0xFF) as u8);
    nalu.push((header & 0xFF) as u8);
    nalu.extend(rbsp);
    nalu
}

/// Parse SEI payload from NAL unit data
pub fn parse_sei_payload(nal_data: &[u8], is_h265: bool) -> Result<Vec<Vec<u8>>> {
    let mut payloads = Vec::new();
    let start = if is_h265 { 2 } else { 1 };

    if nal_data.len() <= start {
        return Ok(payloads);
    }

    let mut i = start;
    while i < nal_data.len() {
        let mut payload_type: u32 = 0;
        while i < nal_data.len() && nal_data[i] == 0xFF {
            payload_type += 255;
            i += 1;
        }
        if i >= nal_data.len() {
            break;
        }
        payload_type += nal_data[i] as u32;
        i += 1;

        let mut payload_size: u32 = 0;
        while i < nal_data.len() && nal_data[i] == 0xFF {
            payload_size += 255;
            i += 1;
        }
        if i >= nal_data.len() {
            break;
        }
        payload_size += nal_data[i] as u32;
        i += 1;

        let end = i + payload_size as usize;
        if end > nal_data.len() {
            break;
        }
        payloads.push(nal_data[i..end].to_vec());
        i = end;

        if i < nal_data.len() && nal_data[i] == 0x80 {
            break;
        }
    }

    Ok(payloads)
}

/// Convert AVCC format to Annex B format (with start codes)
pub fn avcc_to_annexb(data: &[u8], length_size: u8) -> Vec<u8> {
    let mut result = Vec::new();
    let mut offset = 0;
    let length_size = length_size as usize;

    while offset + length_size <= data.len() {
        let mut nal_size: usize = 0;
        for i in 0..length_size {
            nal_size = (nal_size << 8) | data[offset + i] as usize;
        }
        offset += length_size;

        if nal_size == 0 || offset + nal_size > data.len() {
            break;
        }

        result.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
        result.extend_from_slice(&data[offset..offset + nal_size]);
        offset += nal_size;
    }

    result
}

/// Convert Annex B format to AVCC format
pub fn annexb_to_avcc(data: &[u8], length_size: u8) -> Vec<u8> {
    let mut result = Vec::new();
    let mut i = 0;
    let length_size = length_size as usize;

    while i < data.len() {
        let start = find_start_code(data, i);
        if start.is_none() {
            break;
        }
        let (start_pos, start_len) = start.unwrap();
        i = start_pos + start_len;

        let end = find_start_code(data, i);
        let nal_end = end.map(|(pos, _)| pos).unwrap_or(data.len());
        let nal_data = &data[i..nal_end];

        if !nal_data.is_empty() {
            let len = nal_data.len() as u32;
            for j in 0..length_size {
                result.push(((len >> (8 * (length_size - 1 - j))) & 0xFF) as u8);
            }
            result.extend_from_slice(nal_data);
        }

        i = nal_end;
    }

    result
}

fn find_start_code(data: &[u8], start: usize) -> Option<(usize, usize)> {
    let mut i = start;
    while i + 2 < data.len() {
        if data[i] == 0x00 && data[i + 1] == 0x00 {
            if data[i + 2] == 0x01 {
                return Some((i, 3));
            }
            if i + 3 < data.len() && data[i + 2] == 0x00 && data[i + 3] == 0x01 {
                return Some((i, 4));
            }
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nal_type_h264() {
        let data = [0x67, 0x42, 0xC0];
        let nal = NalUnit::parse(&data, false);
        assert_eq!(nal.nalu_type, 7);
        assert!(!nal.is_sei());
        assert!(!nal.is_keyframe());
        assert!(nal.is_non_vcl());
    }

    #[test]
    fn test_nal_type_h265() {
        let data = [0x40, 0x01];
        let nal = NalUnit::parse(&data, true);
        assert_eq!(nal.nalu_type, 32);
        assert!(!nal.is_sei());
        assert!(nal.is_non_vcl());
        assert_eq!(nal.layer_id, 0);
        assert_eq!(nal.temporal_id, 1);
    }

    #[test]
    fn test_nal_type_h265_idr() {
        let header: u16 = ((19 as u16) << 9) | 1;
        let data = [((header >> 8) & 0xFF) as u8, (header & 0xFF) as u8];
        let nal = NalUnit::parse(&data, true);
        assert_eq!(nal.nalu_type, 19);
        assert!(nal.is_keyframe());
        assert!(nal.is_vcl());
        assert!(nal.is_irap());
    }

    #[test]
    fn test_create_h264_sei() {
        let payload = b"test";
        let sei = create_h264_sei_nalu(payload);
        assert_eq!(sei[0] & 0x1F, 6);
    }

    #[test]
    fn test_create_h265_sei() {
        let payload = b"test";
        let sei = create_h265_sei_nalu(payload);
        assert_eq!((sei[0] >> 1) & 0x3F, 39);
    }

    #[test]
    fn test_avcc_annexb_conversion() {
        let avcc = vec![0x00, 0x00, 0x00, 0x03, 0x67, 0x42, 0xC0];
        let annexb = avcc_to_annexb(&avcc, 4);
        assert_eq!(annexb[0..4], [0x00, 0x00, 0x00, 0x01]);
        let back = annexb_to_avcc(&annexb, 4);
        assert_eq!(back, avcc);
    }
}
