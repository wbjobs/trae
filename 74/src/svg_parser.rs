use crate::types::Point;
use std::f64::consts::PI;

pub fn parse_svg_path(path_data: &str) -> Vec<Point> {
    let mut points: Vec<Point> = Vec::new();
    let mut current_pos = Point::new(0.0, 0.0);
    let mut start_pos = Point::new(0.0, 0.0);
    
    let tokens = tokenize_path(path_data);
    let mut i = 0;
    
    while i < tokens.len() {
        match tokens[i].as_str() {
            "M" | "m" => {
                let is_relative = tokens[i] == "m";
                i += 1;
                while i < tokens.len() && is_number(&tokens[i]) {
                    let x = parse_number(&tokens[i]);
                    i += 1;
                    let y = parse_number(&tokens[i]);
                    i += 1;
                    
                    if is_relative && !points.is_empty() {
                        current_pos = Point::new(current_pos.x + x, current_pos.y + y);
                    } else {
                        current_pos = Point::new(x, y);
                    }
                    
                    if points.is_empty() {
                        start_pos = current_pos;
                    }
                    points.push(current_pos);
                }
            }
            "L" | "l" => {
                let is_relative = tokens[i] == "l";
                i += 1;
                while i < tokens.len() && is_number(&tokens[i]) {
                    let x = parse_number(&tokens[i]);
                    i += 1;
                    let y = parse_number(&tokens[i]);
                    i += 1;
                    
                    if is_relative {
                        current_pos = Point::new(current_pos.x + x, current_pos.y + y);
                    } else {
                        current_pos = Point::new(x, y);
                    }
                    points.push(current_pos);
                }
            }
            "H" | "h" => {
                let is_relative = tokens[i] == "h";
                i += 1;
                while i < tokens.len() && is_number(&tokens[i]) {
                    let x = parse_number(&tokens[i]);
                    i += 1;
                    
                    if is_relative {
                        current_pos = Point::new(current_pos.x + x, current_pos.y);
                    } else {
                        current_pos = Point::new(x, current_pos.y);
                    }
                    points.push(current_pos);
                }
            }
            "V" | "v" => {
                let is_relative = tokens[i] == "v";
                i += 1;
                while i < tokens.len() && is_number(&tokens[i]) {
                    let y = parse_number(&tokens[i]);
                    i += 1;
                    
                    if is_relative {
                        current_pos = Point::new(current_pos.x, current_pos.y + y);
                    } else {
                        current_pos = Point::new(current_pos.x, y);
                    }
                    points.push(current_pos);
                }
            }
            "Z" | "z" => {
                if !points.is_empty() && points.first() != points.last() {
                    points.push(start_pos);
                }
                current_pos = start_pos;
                i += 1;
            }
            "C" | "c" => {
                let is_relative = tokens[i] == "c";
                i += 1;
                while i < tokens.len() && is_number(&tokens[i]) {
                    let (curve_points, new_i) = parse_cubic_bezier(
                        &tokens, i, current_pos, is_relative
                    );
                    i = new_i;
                    for p in curve_points {
                        points.push(p);
                    }
                    current_pos = points[points.len() - 1];
                }
            }
            "Q" | "q" => {
                let is_relative = tokens[i] == "q";
                i += 1;
                while i < tokens.len() && is_number(&tokens[i]) {
                    let (curve_points, new_i) = parse_quadratic_bezier(
                        &tokens, i, current_pos, is_relative
                    );
                    i = new_i;
                    for p in curve_points {
                        points.push(p);
                    }
                    current_pos = points[points.len() - 1];
                }
            }
            "A" | "a" => {
                let is_relative = tokens[i] == "a";
                i += 1;
                while i < tokens.len() && is_number(&tokens[i]) {
                    let (arc_points, new_i, new_pos) = parse_arc(
                        &tokens, i, current_pos, is_relative
                    );
                    i = new_i;
                    for p in arc_points {
                        points.push(p);
                    }
                    current_pos = new_pos;
                }
            }
            _ => {
                i += 1;
            }
        }
    }
    
    if points.len() > 1 && points.first() == points.last() {
        points.pop();
    }
    
    points
}

fn tokenize_path(path_data: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut chars = path_data.chars().peekable();
    
    while let Some(c) = chars.next() {
        if c.is_whitespace() || c == ',' {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
        } else if c.is_alphabetic() {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push(c.to_string());
        } else if c.is_ascii_digit() || c == '.' || c == '-' || c == '+' {
            if (c == '-' || c == '+') && !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            current.push(c);
        }
    }
    
    if !current.is_empty() {
        tokens.push(current);
    }
    
    tokens
}

fn is_number(s: &str) -> bool {
    s.parse::<f64>().is_ok()
}

fn parse_number(s: &str) -> f64 {
    s.parse::<f64>().unwrap_or(0.0)
}

fn parse_cubic_bezier(
    tokens: &[String],
    start_idx: usize,
    current: Point,
    is_relative: bool,
) -> (Vec<Point>, usize) {
    let mut idx = start_idx;
    let mut points = Vec::new();
    
    let cx1 = parse_number(&tokens[idx]);
    idx += 1;
    let cy1 = parse_number(&tokens[idx]);
    idx += 1;
    let cx2 = parse_number(&tokens[idx]);
    idx += 1;
    let cy2 = parse_number(&tokens[idx]);
    idx += 1;
    let x = parse_number(&tokens[idx]);
    idx += 1;
    let y = parse_number(&tokens[idx]);
    idx += 1;
    
    let p0 = current;
    let p1 = if is_relative {
        Point::new(current.x + cx1, current.y + cy1)
    } else {
        Point::new(cx1, cy1)
    };
    let p2 = if is_relative {
        Point::new(current.x + cx2, current.y + cy2)
    } else {
        Point::new(cx2, cy2)
    };
    let p3 = if is_relative {
        Point::new(current.x + x, current.y + y)
    } else {
        Point::new(x, y)
    };
    
    let segments = 10;
    for i in 1..=segments {
        let t = i as f64 / segments as f64;
        let mt = 1.0 - t;
        let px = mt * mt * mt * p0.x + 3.0 * mt * mt * t * p1.x + 3.0 * mt * t * t * p2.x + t * t * t * p3.x;
        let py = mt * mt * mt * p0.y + 3.0 * mt * mt * t * p1.y + 3.0 * mt * t * t * p2.y + t * t * t * p3.y;
        points.push(Point::new(px, py));
    }
    
    (points, idx)
}

fn parse_quadratic_bezier(
    tokens: &[String],
    start_idx: usize,
    current: Point,
    is_relative: bool,
) -> (Vec<Point>, usize) {
    let mut idx = start_idx;
    let mut points = Vec::new();
    
    let cx = parse_number(&tokens[idx]);
    idx += 1;
    let cy = parse_number(&tokens[idx]);
    idx += 1;
    let x = parse_number(&tokens[idx]);
    idx += 1;
    let y = parse_number(&tokens[idx]);
    idx += 1;
    
    let p0 = current;
    let p1 = if is_relative {
        Point::new(current.x + cx, current.y + cy)
    } else {
        Point::new(cx, cy)
    };
    let p2 = if is_relative {
        Point::new(current.x + x, current.y + y)
    } else {
        Point::new(x, y)
    };
    
    let segments = 10;
    for i in 1..=segments {
        let t = i as f64 / segments as f64;
        let mt = 1.0 - t;
        let px = mt * mt * p0.x + 2.0 * mt * t * p1.x + t * t * p2.x;
        let py = mt * mt * p0.y + 2.0 * mt * t * p1.y + t * t * p2.y;
        points.push(Point::new(px, py));
    }
    
    (points, idx)
}

fn parse_arc(
    tokens: &[String],
    start_idx: usize,
    current: Point,
    is_relative: bool,
) -> (Vec<Point>, usize, Point) {
    let mut idx = start_idx;
    
    let rx = parse_number(&tokens[idx]);
    idx += 1;
    let ry = parse_number(&tokens[idx]);
    idx += 1;
    let x_axis_rotation = parse_number(&tokens[idx]) * PI / 180.0;
    idx += 1;
    let large_arc_flag = parse_number(&tokens[idx]) > 0.5;
    idx += 1;
    let sweep_flag = parse_number(&tokens[idx]) > 0.5;
    idx += 1;
    let x = parse_number(&tokens[idx]);
    idx += 1;
    let y = parse_number(&tokens[idx]);
    idx += 1;
    
    let end = if is_relative {
        Point::new(current.x + x, current.y + y)
    } else {
        Point::new(x, y)
    };
    
    let points = approximate_arc(current, end, rx, ry, x_axis_rotation, large_arc_flag, sweep_flag);
    let new_pos = points.last().copied().unwrap_or(end);
    
    (points, idx, new_pos)
}

fn approximate_arc(
    start: Point,
    end: Point,
    rx: f64,
    ry: f64,
    x_axis_rotation: f64,
    large_arc_flag: bool,
    sweep_flag: bool,
) -> Vec<Point> {
    let mut points = Vec::new();
    
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let dist = (dx * dx + dy * dy).sqrt();
    
    if dist < 1e-6 || rx < 1e-6 || ry < 1e-6 {
        points.push(end);
        return points;
    }
    
    let cos_phi = x_axis_rotation.cos();
    let sin_phi = x_axis_rotation.sin();
    
    let x1 = cos_phi * dx / 2.0 + sin_phi * dy / 2.0;
    let y1 = -sin_phi * dx / 2.0 + cos_phi * dy / 2.0;
    
    let rx_sq = rx * rx;
    let ry_sq = ry * ry;
    let x1_sq = x1 * x1;
    let y1_sq = y1 * y1;
    
    let mut rx = rx;
    let mut ry = ry;
    
    let lambda = x1_sq / rx_sq + y1_sq / ry_sq;
    if lambda > 1.0 {
        rx *= lambda.sqrt();
        ry *= lambda.sqrt();
    }
    
    let rx_sq = rx * rx;
    let ry_sq = ry * ry;
    
    let sign = if large_arc_flag != sweep_flag { -1.0 } else { 1.0 };
    let numerator = rx_sq * ry_sq - rx_sq * y1_sq - ry_sq * x1_sq;
    let denominator = rx_sq * y1_sq + ry_sq * x1_sq;
    
    let factor = if numerator < 0.0 { 0.0 } else { (numerator / denominator).sqrt() };
    let cx1 = sign * factor * (rx * y1 / ry);
    let cy1 = sign * factor * (-ry * x1 / rx);
    
    let cx = cos_phi * cx1 - sin_phi * cy1 + (start.x + end.x) / 2.0;
    let cy = sin_phi * cx1 + cos_phi * cy1 + (start.y + end.y) / 2.0;
    
    let angle_start = ((y1 - cy1) / ry).atan2((x1 - cx1) / rx);
    let angle_end = ((-y1 - cy1) / ry).atan2((-x1 - cx1) / rx);
    
    let mut delta_angle = angle_end - angle_start;
    if sweep_flag && delta_angle < 0.0 {
        delta_angle += 2.0 * PI;
    } else if !sweep_flag && delta_angle > 0.0 {
        delta_angle -= 2.0 * PI;
    }
    
    let segments = ((delta_angle.abs() * 10.0).ceil() as usize).max(2);
    
    for i in 1..=segments {
        let t = i as f64 / segments as f64;
        let angle = angle_start + t * delta_angle;
        
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        
        let px = cos_phi * rx * cos_a - sin_phi * ry * sin_a + cx;
        let py = sin_phi * rx * cos_a + cos_phi * ry * sin_a + cy;
        
        points.push(Point::new(px, py));
    }
    
    points
}
