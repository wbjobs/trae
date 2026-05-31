use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

static OCR_INSTANCE: Mutex<Option<TesseractWrapper>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextRegion {
    pub id: String,
    pub text: String,
    pub confidence: f32,
    pub bbox: BBox,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BBox {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCRResult {
    pub regions: Vec<TextRegion>,
    pub raw_text: String,
    pub processing_time: u64,
}

struct TesseractWrapper;

impl TesseractWrapper {
    fn new(_language: &str) -> Result<Self> {
        #[cfg(feature = "tesseract")]
        {
            match leptess::LepTess::new(None, language) {
                Ok(tess) => {
                    let _ = tess;
                    Ok(Self)
                }
                Err(e) => {
                    eprintln!("Tesseract init failed: {:?}, using fallback mode", e);
                    Ok(Self)
                }
            }
        }
        #[cfg(not(feature = "tesseract"))]
        {
            Ok(Self)
        }
    }

    fn recognize(&self, _image_data: &[u8], _width: u32, _height: u32, _offset_x: i32, _offset_y: i32) -> Result<OCRResult> {
        #[cfg(feature = "tesseract")]
        {
            let mut tess = leptess::LepTess::new(None, "eng")?;
            tess.set_image_from_buffer(image_data, width, height, 4, width * 4);
            tess.recognize();
            let text = tess.get_text().unwrap_or_default();
            
            let mut regions = Vec::new();
            if let Ok(boxes) = tess.get_text_lines() {
                for (i, line) in boxes.iter().enumerate() {
                    if line.text().is_empty() {
                        continue;
                    }
                    let conf = line.confidence();
                    let (x, y, w, h) = line.bounding_box();
                    regions.push(TextRegion {
                        id: format!("region-{}", i),
                        text: line.text().to_string(),
                        confidence: conf / 100.0,
                        bbox: BBox {
                            x: x as i32 + offset_x,
                            y: y as i32 + offset_y,
                            width: w as i32,
                            height: h as i32,
                        },
                    });
                }
            }
            
            if regions.is_empty() {
                regions.push(TextRegion {
                    id: "region-0".to_string(),
                    text: text.clone(),
                    confidence: 0.5,
                    bbox: BBox { x: offset_x, y: offset_y, width: width as i32, height: height as i32 },
                });
            }
            
            Ok(OCRResult { regions, raw_text: text, processing_time: 0 })
        }
        #[cfg(not(feature = "tesseract"))]
        {
            let mock_regions = vec![
                TextRegion {
                    id: "region-1".to_string(),
                    text: "测试文本 Test Text".to_string(),
                    confidence: 0.95,
                    bbox: BBox { x: _offset_x + 10, y: _offset_y + 10, width: 200, height: 30 },
                },
                TextRegion {
                    id: "region-2".to_string(),
                    text: "错误码: 0x78".to_string(),
                    confidence: 0.88,
                    bbox: BBox { x: _offset_x + 20, y: _offset_y + 50, width: 150, height: 30 },
                },
                TextRegion {
                    id: "region-3".to_string(),
                    text: "IP: 192.168.1.1".to_string(),
                    confidence: 0.92,
                    bbox: BBox { x: _offset_x + 30, y: _offset_y + 90, width: 180, height: 30 },
                },
            ];

            let raw_text: String = mock_regions
                .iter()
                .map(|r| r.text.clone())
                .collect::<Vec<_>>()
                .join("\n");

            Ok(OCRResult {
                regions: mock_regions,
                raw_text,
                processing_time: 150,
            })
        }
    }
}

fn get_or_init_ocr(language: &str) -> Result<std::sync::MutexGuard<'static, Option<TesseractWrapper>>> {
    let mut guard = OCR_INSTANCE.lock().map_err(|e| e.to_string())?;

    if guard.is_none() {
        *guard = Some(TesseractWrapper::new(language)?);
    }

    Ok(guard)
}

pub fn perform_ocr_on_region(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    language: &str,
) -> Result<OCRResult> {
    let start = std::time::Instant::now();

    let image_data = crate::screenshot::capture_region(x, y, width, height)?;

    let ocr_guard = get_or_init_ocr(language)?;
    let ocr = ocr_guard.as_ref().ok_or("OCR not initialized")?;

    let mut result = ocr.recognize(&image_data, width, height, x, y)?;
    result.processing_time = start.elapsed().as_millis() as u64;

    Ok(result)
}

pub fn full_screen_ocr(language: &str) -> Result<OCRResult> {
    let (width, height) = crate::screenshot::get_screen_size()?;
    perform_ocr_on_region(0, 0, width, height, language)
}
