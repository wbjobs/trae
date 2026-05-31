use thiserror::Error;

#[derive(Error, Debug)]
pub enum Mp4SeiError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid MP4 file: {0}")]
    InvalidMp4(String),

    #[error("Box not found: {0}")]
    BoxNotFound(String),

    #[error("Invalid box type: {0}")]
    InvalidBoxType(String),

    #[error("Unsupported codec: {0}")]
    UnsupportedCodec(String),

    #[error("Invalid H.264/H.265 bitstream: {0}")]
    InvalidBitstream(String),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Invalid data: {0}")]
    InvalidData(String),

    #[error("Hex decode error: {0}")]
    HexDecode(#[from] hex::FromHexError),

    #[error("Operation not supported: {0}")]
    Unsupported(String),
}

pub type Result<T> = std::result::Result<T, Mp4SeiError>;
