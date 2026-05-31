use plotters::prelude::*;
use std::io::Cursor;

pub fn generate_cpu_chart(data: &[f32], width: u32, height: u32) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut buffer = vec![0u8; (width * height * 4) as usize];
    {
        let root = BitMapBackend::with_buffer(&mut buffer, (width, height)).into_drawing_area();
        root.fill(&RGBColor(15, 15, 30))?;

        let mut chart = ChartBuilder::on(&root)
            .caption("CPU 使用率 (%)", ("sans-serif", 20, &WHITE))
            .margin(10)
            .x_label_area_size(30)
            .y_label_area_size(40)
            .build_cartesian_2d(0..data.len().max(1), 0f32..100f32)?;

        chart
            .configure_mesh()
            .axis_style(&RGBColor(100, 100, 150))
            .draw()?;

        let max_points = 60;
        let start_idx = if data.len() > max_points {
            data.len() - max_points
        } else {
            0
        };

        chart
            .draw_series(LineSeries::new(
                (start_idx..data.len()).map(|i| (i - start_idx, data[i])),
                &RGBColor(0, 212, 255),
            ))?
            .label("CPU")
            .legend(|(x, y)| PathElement::new(vec![(x, y), (x + 20, y)], &RGBColor(0, 212, 255)));

        chart
            .configure_series_labels()
            .background_style(&RGBColor(30, 30, 50))
            .border_style(&RGBColor(100, 100, 150))
            .text_style(("sans-serif", 12, &WHITE))
            .draw()?;
    }

    let mut png_buffer = Vec::new();
    {
        let mut cursor = Cursor::new(&mut png_buffer);
        let encoder = image::codecs::png::PngEncoder::new(&mut cursor);
        let img = image::RgbaImage::from_raw(width, height, buffer)
            .ok_or("Failed to create image")?;
        img.write_with_encoder(encoder)?;
    }

    Ok(png_buffer)
}

pub fn generate_memory_chart(data: &[f32], width: u32, height: u32) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut buffer = vec![0u8; (width * height * 4) as usize];
    {
        let root = BitMapBackend::with_buffer(&mut buffer, (width, height)).into_drawing_area();
        root.fill(&RGBColor(15, 15, 30))?;

        let mut chart = ChartBuilder::on(&root)
            .caption("内存使用率 (%)", ("sans-serif", 20, &WHITE))
            .margin(10)
            .x_label_area_size(30)
            .y_label_area_size(40)
            .build_cartesian_2d(0..data.len().max(1), 0f32..100f32)?;

        chart
            .configure_mesh()
            .axis_style(&RGBColor(100, 100, 150))
            .draw()?;

        let max_points = 60;
        let start_idx = if data.len() > max_points {
            data.len() - max_points
        } else {
            0
        };

        chart
            .draw_series(LineSeries::new(
                (start_idx..data.len()).map(|i| (i - start_idx, data[i])),
                &RGBColor(76, 175, 80),
            ))?
            .label("内存")
            .legend(|(x, y)| PathElement::new(vec![(x, y), (x + 20, y)], &RGBColor(76, 175, 80)));

        chart
            .configure_series_labels()
            .background_style(&RGBColor(30, 30, 50))
            .border_style(&RGBColor(100, 100, 150))
            .text_style(("sans-serif", 12, &WHITE))
            .draw()?;
    }

    let mut png_buffer = Vec::new();
    {
        let mut cursor = Cursor::new(&mut png_buffer);
        let encoder = image::codecs::png::PngEncoder::new(&mut cursor);
        let img = image::RgbaImage::from_raw(width, height, buffer)
            .ok_or("Failed to create image")?;
        img.write_with_encoder(encoder)?;
    }

    Ok(png_buffer)
}

pub fn generate_network_chart(
    data_in: &[u64],
    data_out: &[u64],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut buffer = vec![0u8; (width * height * 4) as usize];
    {
        let root = BitMapBackend::with_buffer(&mut buffer, (width, height)).into_drawing_area();
        root.fill(&RGBColor(15, 15, 30))?;

        let max_val = data_in.iter().chain(data_out.iter()).max().copied().unwrap_or(1) as f32;

        let mut chart = ChartBuilder::on(&root)
            .caption("网络流量 (KB/s)", ("sans-serif", 20, &WHITE))
            .margin(10)
            .x_label_area_size(30)
            .y_label_area_size(50)
            .build_cartesian_2d(0..data_in.len().max(1), 0f32..max_val.max(1.0))?;

        chart
            .configure_mesh()
            .axis_style(&RGBColor(100, 100, 150))
            .draw()?;

        let max_points = 60;
        let start_idx = if data_in.len() > max_points {
            data_in.len() - max_points
        } else {
            0
        };

        chart
            .draw_series(LineSeries::new(
                (start_idx..data_in.len()).map(|i| (i - start_idx, data_in[i] as f32 / 1024.0)),
                &RGBColor(0, 212, 255),
            ))?
            .label("下载")
            .legend(|(x, y)| PathElement::new(vec![(x, y), (x + 20, y)], &RGBColor(0, 212, 255)));

        chart
            .draw_series(LineSeries::new(
                (start_idx..data_out.len()).map(|i| (i - start_idx, data_out[i] as f32 / 1024.0)),
                &RGBColor(255, 152, 0),
            ))?
            .label("上传")
            .legend(|(x, y)| PathElement::new(vec![(x, y), (x + 20, y)], &RGBColor(255, 152, 0)));

        chart
            .configure_series_labels()
            .background_style(&RGBColor(30, 30, 50))
            .border_style(&RGBColor(100, 100, 150))
            .text_style(("sans-serif", 12, &WHITE))
            .draw()?;
    }

    let mut png_buffer = Vec::new();
    {
        let mut cursor = Cursor::new(&mut png_buffer);
        let encoder = image::codecs::png::PngEncoder::new(&mut cursor);
        let img = image::RgbaImage::from_raw(width, height, buffer)
            .ok_or("Failed to create image")?;
        img.write_with_encoder(encoder)?;
    }

    Ok(png_buffer)
}

pub fn data_url_from_png(png_data: &[u8]) -> String {
    format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png_data))
}
