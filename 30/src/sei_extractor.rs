use crate::error::{Mp4SeiError, Result};
use crate::h26x::{self, NalUnit};
use crate::mp4::Mp4File;
use byteorder::BigEndian;
use byteorder::WriteBytesExt;
use std::fmt::Write;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Extracted SEI information
#[derive(Debug, Clone)]
pub struct ExtractedSei {
    pub sample_index: usize,
    pub pts: u64,
    pub dts: u64,
    pub is_keyframe: bool,
    pub payloads: Vec<SeiPayload>,
}

#[derive(Debug, Clone)]
pub struct SeiPayload {
    pub payload_type: u32,
    pub data: Vec<u8>,
}

/// Verification report
#[derive(Debug, Clone)]
pub struct VerificationReport {
    pub original_file: String,
    pub modified_file: String,
    pub original_md5: String,
    pub modified_md5: String,
    pub original_video_hash: String,
    pub modified_video_hash: String,
    pub video_hash_match: bool,
    pub sei_payloads_found: usize,
    pub is_lossless: bool,
    pub details: String,
}

/// SEI extractor for MP4 files
pub struct SeiExtractor;

impl SeiExtractor {
    /// Extract all SEI payloads from an MP4 file
    pub fn extract_sei(path: &Path) -> Result<Vec<ExtractedSei>> {
        let mp4 = Mp4File::parse(path)?;
        let trak = mp4
            .get_video_track()
            .ok_or_else(|| Mp4SeiError::BoxNotFound("video track".to_string()))?;
        let stbl = &trak.mdia.minf.stbl;
        let is_h265 = matches!(mp4.get_codec(), Some(b"hvc1"));
        let length_size = stbl.stsd.get_nalu_length_size().unwrap_or(4);
        let mdat_offset = mp4.mdat.as_ref().unwrap().data_offset();

        let mut file = File::open(path)?;
        let mut results = Vec::new();

        for (i, sample) in stbl.samples.iter().enumerate() {
            let offset = mdat_offset + sample.offset_in_mdat;
            file.seek(SeekFrom::Start(offset))?;
            let mut sample_data = vec![0u8; sample.size as usize];
            file.read_exact(&mut sample_data)?;

            let nals = h26x::split_nal_units_avcc(&sample_data, length_size, is_h265);
            let sei_nals: Vec<&NalUnit> = nals.iter().filter(|n| n.is_sei()).collect();

            if !sei_nals.is_empty() {
                let mut payloads = Vec::new();
                for nal in sei_nals {
                    let payload = h26x::parse_sei_payload(&nal.data, is_h265)?;
                    for (idx, data) in payload.into_iter().enumerate() {
                        payloads.push(SeiPayload {
                            payload_type: 5,
                            data,
                        });
                    }
                }

                if !payloads.is_empty() {
                    results.push(ExtractedSei {
                        sample_index: i,
                        pts: sample.pts,
                        dts: sample.dts,
                        is_keyframe: sample.is_keyframe,
                        payloads,
                    });
                }
            }
        }

        Ok(results)
    }

    /// Extract SEI payloads and format as text report
    pub fn extract_sei_report(path: &Path) -> Result<String> {
        let sei_list = Self::extract_sei(path)?;
        let mut report = String::new();

        writeln!(report, "SEI Extraction Report for: {}", path.display()).unwrap();
        writeln!(report, "========================================").unwrap();
        writeln!(report, "Total SEI messages found: {}", sei_list.len()).unwrap();
        writeln!(report).unwrap();

        for (i, sei) in sei_list.iter().enumerate() {
            writeln!(report, "SEI #{}:", i + 1).unwrap();
            writeln!(report, "  Sample index: {}", sei.sample_index).unwrap();
            writeln!(report, "  PTS: {}", sei.pts).unwrap();
            writeln!(report, "  DTS: {}", sei.dts).unwrap();
            writeln!(report, "  Keyframe: {}", sei.is_keyframe).unwrap();
            writeln!(report, "  Payloads:").unwrap();

            for (j, payload) in sei.payloads.iter().enumerate() {
                writeln!(report, "    [{}] Type: {}, Size: {} bytes", j, payload.payload_type, payload.data.len()).unwrap();
                writeln!(report, "         Hex: {}", hex::encode(&payload.data)).unwrap();
                if let Ok(text) = std::str::from_utf8(&payload.data) {
                    writeln!(report, "         Text: \"{}\"", text).unwrap();
                }
                if payload.data.len() == 16 {
                    let user_id = u64::from_be_bytes(payload.data[0..8].try_into().unwrap());
                    let timestamp = u64::from_be_bytes(payload.data[8..16].try_into().unwrap());
                    writeln!(report, "         User ID: {}, Timestamp: {}", user_id, timestamp).unwrap();
                }
            }
            writeln!(report).unwrap();
        }

        if sei_list.is_empty() {
            writeln!(report, "No SEI payloads found in this file.").unwrap();
        }

        Ok(report)
    }

    /// Verify that SEI injection is lossless by comparing video content hashes
    pub fn verify(original_path: &Path, modified_path: &Path) -> Result<VerificationReport> {
        let original = Mp4File::parse(original_path)?;
        let modified = Mp4File::parse(modified_path)?;

        let original_md5 = Self::compute_file_md5(original_path)?;
        let modified_md5 = Self::compute_file_md5(modified_path)?;

        let original_video_hash = Self::compute_video_content_hash(&original)?;
        let modified_video_hash = Self::compute_video_content_hash(&modified)?;

        let sei_count = Self::extract_sei(modified_path)?.len();

        let video_hash_match = original_video_hash == modified_video_hash;
        let is_lossless = video_hash_match;

        let mut details = String::new();
        writeln!(details, "Verification Report").unwrap();
        writeln!(details, "===================").unwrap();
        writeln!(details, "Original file: {}", original_path.display()).unwrap();
        writeln!(details, "Modified file: {}", modified_path.display()).unwrap();
        writeln!(details).unwrap();
        writeln!(details, "File Hashes:").unwrap();
        writeln!(details, "  Original MD5: {}", original_md5).unwrap();
        writeln!(details, "  Modified MD5: {}", modified_md5).unwrap();
        writeln!(details, "  Files differ: {}", original_md5 != modified_md5).unwrap();
        writeln!(details).unwrap();
        writeln!(details, "Video Content Hashes (excluding SEI NALUs):").unwrap();
        writeln!(details, "  Original: {}", original_video_hash).unwrap();
        writeln!(details, "  Modified: {}", modified_video_hash).unwrap();
        writeln!(details, "  Match: {}", video_hash_match).unwrap();
        writeln!(details).unwrap();
        writeln!(details, "SEI Analysis:").unwrap();
        writeln!(details, "  SEI payloads in modified file: {}", sei_count).unwrap();
        writeln!(details).unwrap();
        writeln!(details, "Result: {}", if is_lossless { "✅ LOSSLESS - Video content is unchanged" } else { "⚠️  POTENTIALLY LOSSY - Video content differs" }).unwrap();

        Ok(VerificationReport {
            original_file: original_path.display().to_string(),
            modified_file: modified_path.display().to_string(),
            original_md5,
            modified_md5,
            original_video_hash,
            modified_video_hash,
            video_hash_match,
            sei_payloads_found: sei_count,
            is_lossless,
            details,
        })
    }

    /// Compute MD5 hash of a file
    fn compute_file_md5(path: &Path) -> Result<String> {
        let mut file = File::open(path)?;
        let mut hasher = md5::Context::new();
        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.consume(&buffer[..bytes_read]);
        }
        Ok(format!("{:x}", hasher.compute()))
    }

    /// Compute hash of video content, excluding SEI NALUs
    fn compute_video_content_hash(mp4: &Mp4File) -> Result<String> {
        let trak = mp4
            .get_video_track()
            .ok_or_else(|| Mp4SeiError::BoxNotFound("video track".to_string()))?;
        let stbl = &trak.mdia.minf.stbl;
        let is_h265 = matches!(mp4.get_codec(), Some(b"hvc1"));
        let length_size = stbl.stsd.get_nalu_length_size().unwrap_or(4);
        let mdat_offset = mp4.mdat.as_ref().unwrap().data_offset();

        let mut file = File::open(&mp4.file_path)?;
        let mut hasher = md5::Context::new();

        for sample in &stbl.samples {
            let offset = mdat_offset + sample.offset_in_mdat;
            file.seek(SeekFrom::Start(offset))?;
            let mut sample_data = vec![0u8; sample.size as usize];
            file.read_exact(&mut sample_data)?;

            let nals = h26x::split_nal_units_avcc(&sample_data, length_size, is_h265);
            for nal in &nals {
                if !nal.is_sei() {
                    hasher.consume(&nal.data);
                }
            }

            let mut ts_bytes = Vec::with_capacity(16);
            ts_bytes.write_u64::<BigEndian>(sample.pts).unwrap();
            ts_bytes.write_u64::<BigEndian>(sample.dts).unwrap();
            hasher.consume(&ts_bytes);
        }

        Ok(format!("{:x}", hasher.compute()))
    }
}

/// Simple MD5 implementation (to avoid extra dependency)
mod md5 {
    pub struct Context {
        state: [u32; 4],
        count: u64,
        buffer: [u8; 64],
    }

    impl Context {
        pub fn new() -> Self {
            Self {
                state: [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476],
                count: 0,
                buffer: [0; 64],
            }
        }

        pub fn consume(&mut self, data: &[u8]) {
            let mut input = data;
            let mut index = ((self.count >> 3) & 0x3F) as usize;
            self.count += (input.len() as u64) << 3;

            let part_len = 64 - index;
            let mut i = 0;

            if input.len() >= part_len {
                self.buffer[index..].copy_from_slice(&input[..part_len]);
                Self::transform(&mut self.state, &self.buffer);
                i = part_len;
                while i + 63 < input.len() {
                    let mut block = [0u8; 64];
                    block.copy_from_slice(&input[i..i + 64]);
                    Self::transform(&mut self.state, &block);
                    i += 64;
                }
                index = 0;
            }

            if i < input.len() {
                let remaining = input.len() - i;
                self.buffer[index..index + remaining].copy_from_slice(&input[i..]);
            }
        }

        pub fn compute(mut self) -> Digest {
            let mut final_count = [0u8; 8];
            for i in 0..8 {
                final_count[i] = ((self.count >> (8 * i)) & 0xFF) as u8;
            }

            let index = ((self.count >> 3) & 0x3F) as usize;
            let pad_len = if index < 56 { 56 - index } else { 120 - index };

            let mut padding = vec![0u8; pad_len + 8];
            padding[0] = 0x80;
            padding[pad_len..].copy_from_slice(&final_count);
            self.consume(&padding[..pad_len + 8]);

            let mut result = [0u8; 16];
            for i in 0..4 {
                for j in 0..4 {
                    result[i * 4 + j] = ((self.state[i] >> (8 * j)) & 0xFF) as u8;
                }
            }
            Digest(result)
        }

        fn transform(state: &mut [u32; 4], block: &[u8; 64]) {
            let mut x = [0u32; 16];
            for i in 0..16 {
                x[i] = (block[i * 4] as u32)
                    | ((block[i * 4 + 1] as u32) << 8)
                    | ((block[i * 4 + 2] as u32) << 16)
                    | ((block[i * 4 + 3] as u32) << 24);
            }

            let (mut a, mut b, mut c, mut d) = (state[0], state[1], state[2], state[3]);

            const S: [u32; 64] = [
                7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
                5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
                4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
                6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
            ];

            const K: [u32; 64] = [
                0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
                0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
                0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
                0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
                0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
                0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
                0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
                0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
                0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
                0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
                0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
                0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
                0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
                0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
                0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
                0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
            ];

            for i in 0..64 {
                let (f, g) = match i {
                    0..=15 => ((b & c) | (!b & d), i),
                    16..=31 => ((d & b) | (!d & c), (5 * i + 1) % 16),
                    32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
                    _ => (c ^ (b | !d), (7 * i) % 16),
                };
                let temp = d;
                d = c;
                c = b;
                b = b.wrapping_add(a.wrapping_add(f).wrapping_add(K[i]).wrapping_add(x[g]).rotate_left(S[i]));
                a = temp;
            }

            state[0] = state[0].wrapping_add(a);
            state[1] = state[1].wrapping_add(b);
            state[2] = state[2].wrapping_add(c);
            state[3] = state[3].wrapping_add(d);
        }
    }

    pub struct Digest(pub [u8; 16]);

    impl std::fmt::Display for Digest {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            for byte in &self.0 {
                write!(f, "{:02x}", byte)?;
            }
            Ok(())
        }
    }

    impl std::fmt::LowerHex for Digest {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            for byte in &self.0 {
                write!(f, "{:02x}", byte)?;
            }
            Ok(())
        }
    }
}
