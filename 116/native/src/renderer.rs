use gl::types::*;
use glam::{Mat4, Vec3, Vec4};
use std::ffi::CString;
use std::mem;
use std::ptr;

use crate::types::{Color, MapViewState, MapViewport, Vertex};
use crate::buildings::BuildingVertex;
use crate::mbtiles::geo_to_mercator;

pub struct Renderer {
    program_2d: GLuint,
    program_3d: GLuint,
    vao_2d: GLuint,
    vbo_2d: GLuint,
    ebo_2d: GLuint,
    vao_3d: GLuint,
    vbo_3d: GLuint,
    ebo_3d: GLuint,
    vertex_count_2d: i32,
    index_count_2d: i32,
    vertex_count_3d: i32,
    index_count_3d: i32,
    is_initialized: bool,
    buildings_enabled: bool,
    light_direction: Vec3,
    ambient_intensity: f32,
    diffuse_intensity: f32,
}

impl Renderer {
    pub fn new() -> Self {
        Self {
            program_2d: 0,
            program_3d: 0,
            vao_2d: 0,
            vbo_2d: 0,
            ebo_2d: 0,
            vao_3d: 0,
            vbo_3d: 0,
            ebo_3d: 0,
            vertex_count_2d: 0,
            index_count_2d: 0,
            vertex_count_3d: 0,
            index_count_3d: 0,
            is_initialized: false,
            buildings_enabled: true,
            light_direction: Vec3::new(0.5, -0.7, 1.0).normalize(),
            ambient_intensity: 0.4,
            diffuse_intensity: 0.6,
        }
    }

    pub fn init(&mut self) -> Result<(), String> {
        self.program_2d = create_2d_shader_program()?;
        self.program_3d = create_3d_shader_program()?;

        unsafe {
            gl::GenVertexArrays(1, &mut self.vao_2d);
            gl::GenBuffers(1, &mut self.vbo_2d);
            gl::GenBuffers(1, &mut self.ebo_2d);

            gl::GenVertexArrays(1, &mut self.vao_3d);
            gl::GenBuffers(1, &mut self.vbo_3d);
            gl::GenBuffers(1, &mut self.ebo_3d);
        }
        self.is_initialized = true;
        Ok(())
    }

    pub fn update_2d_data(&mut self, vertices: &[Vertex], indices: &[u32]) {
        if !self.is_initialized {
            return;
        }

        unsafe {
            gl::BindVertexArray(self.vao_2d);

            gl::BindBuffer(gl::ARRAY_BUFFER, self.vbo_2d);
            gl::BufferData(
                gl::ARRAY_BUFFER,
                (vertices.len() * mem::size_of::<Vertex>()) as GLsizeiptr,
                vertices.as_ptr() as *const GLvoid,
                gl::DYNAMIC_DRAW,
            );

            gl::BindBuffer(gl::ELEMENT_ARRAY_BUFFER, self.ebo_2d);
            gl::BufferData(
                gl::ELEMENT_ARRAY_BUFFER,
                (indices.len() * mem::size_of::<u32>()) as GLsizeiptr,
                indices.as_ptr() as *const GLvoid,
                gl::DYNAMIC_DRAW,
            );

            let stride = mem::size_of::<Vertex>() as GLsizei;

            gl::VertexAttribPointer(
                0,
                2,
                gl::FLOAT,
                gl::FALSE,
                stride,
                ptr::null(),
            );
            gl::EnableVertexAttribArray(0);

            let color_offset = mem::size_of::<[f32; 2]>() as *const GLvoid;
            gl::VertexAttribPointer(
                1,
                4,
                gl::FLOAT,
                gl::FALSE,
                stride,
                color_offset,
            );
            gl::EnableVertexAttribArray(1);

            gl::BindVertexArray(0);
        }

        self.vertex_count_2d = vertices.len() as i32;
        self.index_count_2d = indices.len() as i32;
    }

    pub fn update_3d_data(&mut self, vertices: &[BuildingVertex], indices: &[u32]) {
        if !self.is_initialized {
            return;
        }

        unsafe {
            gl::BindVertexArray(self.vao_3d);

            gl::BindBuffer(gl::ARRAY_BUFFER, self.vbo_3d);
            gl::BufferData(
                gl::ARRAY_BUFFER,
                (vertices.len() * mem::size_of::<BuildingVertex>()) as GLsizeiptr,
                vertices.as_ptr() as *const GLvoid,
                gl::DYNAMIC_DRAW,
            );

            gl::BindBuffer(gl::ELEMENT_ARRAY_BUFFER, self.ebo_3d);
            gl::BufferData(
                gl::ELEMENT_ARRAY_BUFFER,
                (indices.len() * mem::size_of::<u32>()) as GLsizeiptr,
                indices.as_ptr() as *const GLvoid,
                gl::DYNAMIC_DRAW,
            );

            let stride = mem::size_of::<BuildingVertex>() as GLsizei;

            gl::VertexAttribPointer(
                0,
                3,
                gl::FLOAT,
                gl::FALSE,
                stride,
                ptr::null(),
            );
            gl::EnableVertexAttribArray(0);

            let normal_offset = mem::size_of::<[f32; 3]>() as *const GLvoid;
            gl::VertexAttribPointer(
                1,
                3,
                gl::FLOAT,
                gl::FALSE,
                stride,
                normal_offset,
            );
            gl::EnableVertexAttribArray(1);

            let color_offset = (mem::size_of::<[f32; 3]>() + mem::size_of::<[f32; 3]>()) as *const GLvoid;
            gl::VertexAttribPointer(
                2,
                4,
                gl::FLOAT,
                gl::FALSE,
                stride,
                color_offset,
            );
            gl::EnableVertexAttribArray(2);

            gl::BindVertexArray(0);
        }

        self.vertex_count_3d = vertices.len() as i32;
        self.index_count_3d = indices.len() as i32;
    }

    pub fn render(&self, view_state: MapViewState) {
        if !self.is_initialized {
            return;
        }

        unsafe {
            gl::Enable(gl::DEPTH_TEST);
            gl::DepthFunc(gl::LEQUAL);

            gl::ClearColor(0.945, 0.933, 0.910, 1.0);
            gl::Clear(gl::COLOR_BUFFER_BIT | gl::DEPTH_BUFFER_BIT);

            self.render_2d(&view_state);

            if self.buildings_enabled && self.index_count_3d > 0 {
                self.render_3d(&view_state);
            }

            gl::Disable(gl::DEPTH_TEST);
        }
    }

    fn render_2d(&self, view_state: &MapViewState) {
        if self.index_count_2d == 0 {
            return;
        }

        unsafe {
            gl::UseProgram(self.program_2d);

            let mvp = self.compute_2d_mvp(view_state);
            let mvp_loc = gl::GetUniformLocation(
                self.program_2d,
                CString::new("mvp").unwrap().as_ptr(),
            );
            gl::UniformMatrix4fv(mvp_loc, 1, gl::FALSE, mvp.as_ref().as_ptr());

            gl::BindVertexArray(self.vao_2d);
            gl::DrawElements(
                gl::TRIANGLES,
                self.index_count_2d,
                gl::UNSIGNED_INT,
                ptr::null(),
            );
            gl::BindVertexArray(0);
        }
    }

    fn render_3d(&self, view_state: &MapViewState) {
        if self.index_count_3d == 0 {
            return;
        }

        unsafe {
            gl::UseProgram(self.program_3d);

            let mvp = self.compute_3d_mvp(view_state);
            let mvp_loc = gl::GetUniformLocation(
                self.program_3d,
                CString::new("mvp").unwrap().as_ptr(),
            );
            gl::UniformMatrix4fv(mvp_loc, 1, gl::FALSE, mvp.as_ref().as_ptr());

            let light_loc = gl::GetUniformLocation(
                self.program_3d,
                CString::new("light_direction").unwrap().as_ptr(),
            );
            gl::Uniform3f(
                light_loc,
                self.light_direction.x,
                self.light_direction.y,
                self.light_direction.z,
            );

            let ambient_loc = gl::GetUniformLocation(
                self.program_3d,
                CString::new("ambient_intensity").unwrap().as_ptr(),
            );
            gl::Uniform1f(ambient_loc, self.ambient_intensity);

            let diffuse_loc = gl::GetUniformLocation(
                self.program_3d,
                CString::new("diffuse_intensity").unwrap().as_ptr(),
            );
            gl::Uniform1f(diffuse_loc, self.diffuse_intensity);

            gl::Enable(gl::CULL_FACE);
            gl::CullFace(gl::BACK);

            gl::BindVertexArray(self.vao_3d);
            gl::DrawElements(
                gl::TRIANGLES,
                self.index_count_3d,
                gl::UNSIGNED_INT,
                ptr::null(),
            );
            gl::BindVertexArray(0);

            gl::Disable(gl::CULL_FACE);
        }
    }

    fn compute_2d_mvp(&self, view_state: &MapViewState) -> Mat4 {
        let vp = view_state.viewport;
        let (center_x, center_y) =
            geo_to_mercator(vp.center.latitude, vp.center.longitude);

        let scale = 2.0f32.powf(vp.zoom - 11.0);
        let aspect = view_state.width as f32 / view_state.height as f32;
        let half_height = 1.0 / scale;
        let half_width = half_height * aspect;

        let left = center_x as f32 - half_width;
        let right = center_x as f32 + half_width;
        let bottom = center_y as f32 - half_height;
        let top = center_y as f32 + half_height;

        let projection = Mat4::ortho_rh(left, right, bottom, top, -1.0, 1.0);
        let view = Mat4::IDENTITY;

        projection * view
    }

    fn compute_3d_mvp(&self, view_state: &MapViewState) -> Mat4 {
        let vp = view_state.viewport;
        let (center_x, center_y) =
            geo_to_mercator(vp.center.latitude, vp.center.longitude);

        let scale = 2.0f32.powf(vp.zoom - 11.0);
        let aspect = view_state.width as f32 / view_state.height as f32;

        let half_height = 1.0 / scale;
        let half_width = half_height * aspect;

        let building_height_scale = scale * 10.0;

        let left = center_x as f32 - half_width;
        let right = center_x as f32 + half_width;
        let bottom = center_y as f32 - half_height;
        let top = center_y as f32 + half_height;

        let near = -1000.0 / building_height_scale;
        let far = 1000.0 / building_height_scale;

        let projection = Mat4::ortho_rh(left, right, bottom, top, near, far);

        let camera_height = 500.0 / building_height_scale;
        let camera_distance = 200.0 / building_height_scale;

        let tilt_rad = vp.tilt.to_radians();
        let rotation_rad = vp.rotation.to_radians();

        let camera_offset_x = camera_distance * tilt_rad.sin() * rotation_rad.sin();
        let camera_offset_y = -camera_distance * tilt_rad.sin() * rotation_rad.cos();

        let eye = Vec3::new(
            center_x as f32 + camera_offset_x,
            center_y as f32 + camera_offset_y,
            camera_height,
        );
        let target = Vec3::new(center_x as f32, center_y as f32, 0.0);
        let up = Vec3::new(0.0, 0.0, 1.0);

        let view = Mat4::look_at_rh(eye, target, up);

        let translate = Mat4::from_translation(Vec3::new(
            -(center_x as f32),
            -(center_y as f32),
            0.0,
        ));
        let rotate_z = Mat4::from_rotation_z(rotation_rad);
        let rotate_x = Mat4::from_rotation_x(tilt_rad);
        let translate_back = Mat4::from_translation(Vec3::new(
            center_x as f32,
            center_y as f32,
            0.0,
        ));

        let transform = translate_back * rotate_x * rotate_z * translate;

        projection * view * transform
    }

    pub fn set_buildings_enabled(&mut self, enabled: bool) {
        self.buildings_enabled = enabled;
    }

    pub fn is_buildings_enabled(&self) -> bool {
        self.buildings_enabled
    }

    pub fn set_light_direction(&mut self, x: f32, y: f32, z: f32) {
        let len = (x * x + y * y + z * z).sqrt();
        if len > 0.0 {
            self.light_direction = Vec3::new(x / len, y / len, z / len);
        }
    }

    pub fn set_ambient_intensity(&mut self, intensity: f32) {
        self.ambient_intensity = intensity.clamp(0.0, 1.0);
    }

    pub fn set_diffuse_intensity(&mut self, intensity: f32) {
        self.diffuse_intensity = intensity.clamp(0.0, 1.0);
    }

    pub fn cleanup(&mut self) {
        if self.is_initialized {
            unsafe {
                gl::DeleteProgram(self.program_2d);
                gl::DeleteProgram(self.program_3d);
                gl::DeleteVertexArrays(1, &self.vao_2d);
                gl::DeleteBuffers(1, &self.vbo_2d);
                gl::DeleteBuffers(1, &self.ebo_2d);
                gl::DeleteVertexArrays(1, &self.vao_3d);
                gl::DeleteBuffers(1, &self.vbo_3d);
                gl::DeleteBuffers(1, &self.ebo_3d);
            }
            self.is_initialized = false;
        }
    }
}

impl Drop for Renderer {
    fn drop(&mut self) {
        self.cleanup();
    }
}

fn create_2d_shader_program() -> Result<GLuint, String> {
    let vertex_shader = compile_shader(
        gl::VERTEX_SHADER,
        VERTEX_SHADER_SOURCE_2D,
    )?;

    let fragment_shader = compile_shader(
        gl::FRAGMENT_SHADER,
        FRAGMENT_SHADER_SOURCE_2D,
    )?;

    link_program(vertex_shader, fragment_shader)
}

fn create_3d_shader_program() -> Result<GLuint, String> {
    let vertex_shader = compile_shader(
        gl::VERTEX_SHADER,
        VERTEX_SHADER_SOURCE_3D,
    )?;

    let fragment_shader = compile_shader(
        gl::FRAGMENT_SHADER,
        FRAGMENT_SHADER_SOURCE_3D,
    )?;

    link_program(vertex_shader, fragment_shader)
}

fn link_program(vertex_shader: GLuint, fragment_shader: GLuint) -> Result<GLuint, String> {
    let program = unsafe { gl::CreateProgram() };
    unsafe {
        gl::AttachShader(program, vertex_shader);
        gl::AttachShader(program, fragment_shader);
        gl::LinkProgram(program);

        let mut success = 0;
        gl::GetProgramiv(program, gl::LINK_STATUS, &mut success);
        if success == 0 {
            let mut log_length = 0;
            gl::GetProgramiv(program, gl::INFO_LOG_LENGTH, &mut log_length);
            let mut log = vec![0u8; log_length as usize];
            gl::GetProgramInfoLog(
                program,
                log_length,
                ptr::null_mut(),
                log.as_mut_ptr() as *mut GLchar,
            );
            gl::DeleteProgram(program);
            return Err(format!(
                "Shader program linking failed: {}",
                String::from_utf8_lossy(&log)
            ));
        }

        gl::DeleteShader(vertex_shader);
        gl::DeleteShader(fragment_shader);
    }

    Ok(program)
}

fn compile_shader(shader_type: GLenum, source: &str) -> Result<GLuint, String> {
    let shader = unsafe { gl::CreateShader(shader_type) };
    unsafe {
        let c_source = CString::new(source).unwrap();
        gl::ShaderSource(shader, 1, &c_source.as_ptr(), ptr::null());
        gl::CompileShader(shader);

        let mut success = 0;
        gl::GetShaderiv(shader, gl::COMPILE_STATUS, &mut success);
        if success == 0 {
            let mut log_length = 0;
            gl::GetShaderiv(shader, gl::INFO_LOG_LENGTH, &mut log_length);
            let mut log = vec![0u8; log_length as usize];
            gl::GetShaderInfoLog(
                shader,
                log_length,
                ptr::null_mut(),
                log.as_mut_ptr() as *mut GLchar,
            );
            gl::DeleteShader(shader);
            return Err(format!(
                "Shader compilation failed: {}",
                String::from_utf8_lossy(&log)
            ));
        }
    }
    Ok(shader)
}

const VERTEX_SHADER_SOURCE_2D: &str = r#"
#version 330 core
layout (location = 0) in vec2 aPos;
layout (location = 1) in vec4 aColor;

uniform mat4 mvp;

out vec4 vertexColor;

void main() {
    gl_Position = mvp * vec4(aPos, 0.0, 1.0);
    vertexColor = aColor;
}
"#;

const FRAGMENT_SHADER_SOURCE_2D: &str = r#"
#version 330 core
in vec4 vertexColor;

out vec4 FragColor;

void main() {
    FragColor = vertexColor;
}
"#;

const VERTEX_SHADER_SOURCE_3D: &str = r#"
#version 330 core
layout (location = 0) in vec3 aPos;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec4 aColor;

uniform mat4 mvp;

out vec3 normal;
out vec4 vertexColor;

void main() {
    gl_Position = mvp * vec4(aPos, 1.0);
    normal = aNormal;
    vertexColor = aColor;
}
"#;

const FRAGMENT_SHADER_SOURCE_3D: &str = r#"
#version 330 core
in vec3 normal;
in vec4 vertexColor;

uniform vec3 light_direction;
uniform float ambient_intensity;
uniform float diffuse_intensity;

out vec4 FragColor;

void main() {
    vec3 norm = normalize(normal);
    vec3 lightDir = normalize(light_direction);

    float diff = max(dot(norm, lightDir), 0.0);
    vec3 ambient = vertexColor.rgb * ambient_intensity;
    vec3 diffuse = vertexColor.rgb * diff * diffuse_intensity;

    vec3 result = ambient + diffuse;
    FragColor = vec4(result, vertexColor.a);
}
"#;

pub fn create_grid_vertices(viewport: &MapViewport) -> (Vec<Vertex>, Vec<u32>) {
    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    let grid_size = 20;
    let (center_x, center_y) =
        geo_to_mercator(viewport.center.latitude, viewport.center.longitude);
    let scale = 2.0f32.powf(viewport.zoom - 11.0);
    let range = 1.0 / scale * 2.0;

    let step = range / grid_size as f32;
    let start_x = center_x as f32 - range / 2.0;
    let start_y = center_y as f32 - range / 2.0;

    let grid_color = [0.85, 0.85, 0.85, 0.3];
    let land_color = [0.945, 0.933, 0.910, 1.0];

    vertices.push(Vertex {
        position: [start_x, start_y],
        color: land_color,
    });
    vertices.push(Vertex {
        position: [start_x + range, start_y],
        color: land_color,
    });
    vertices.push(Vertex {
        position: [start_x + range, start_y + range],
        color: land_color,
    });
    vertices.push(Vertex {
        position: [start_x, start_y + range],
        color: land_color,
    });
    indices.extend_from_slice(&[0, 1, 2, 0, 2, 3]);

    for i in 0..=grid_size {
        let t = i as f32 * step;

        vertices.push(Vertex {
            position: [start_x + t, start_y],
            color: grid_color,
        });
        vertices.push(Vertex {
            position: [start_x + t, start_y + range],
            color: grid_color,
        });

        let base_idx = (4 + i * 2) as u32;
        indices.push(base_idx);
        indices.push(base_idx + 1);

        vertices.push(Vertex {
            position: [start_x, start_y + t],
            color: grid_color,
        });
        vertices.push(Vertex {
            position: [start_x + range, start_y + t],
            color: grid_color,
        });

        let base_idx2 = (4 + i * 2 + 2) as u32;
        indices.push(base_idx2);
        indices.push(base_idx2 + 1);
    }

    (vertices, indices)
}

pub fn create_route_vertices(
    route_points: &[crate::types::GeoCoordinate],
    color: Color,
) -> (Vec<Vertex>, Vec<u32>) {
    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    let color_arr = [color.r, color.g, color.b, color.a];

    for (i, point) in route_points.iter().enumerate() {
        let (x, y) = geo_to_mercator(point.latitude, point.longitude);
        vertices.push(Vertex {
            position: [x as f32, y as f32],
            color: color_arr,
        });

        if i > 0 {
            indices.push((i - 1) as u32);
            indices.push(i as u32);
        }
    }

    (vertices, indices)
}

pub fn create_gps_marker_vertices(
    coord: crate::types::GeoCoordinate,
    color: Color,
) -> (Vec<Vertex>, Vec<u32>) {
    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    let (x, y) = geo_to_mercator(coord.latitude, coord.longitude);
    let color_arr = [color.r, color.g, color.b, color.a];

    let segments = 32;
    let radius = 0.00005;

    for i in 0..segments {
        let angle = (i as f32 / segments as f32) * 2.0 * std::f32::consts::PI;
        let px = x as f32 + radius * angle.cos();
        let py = y as f32 + radius * angle.sin();
        vertices.push(Vertex {
            position: [px, py],
            color: color_arr,
        });
    }

    vertices.push(Vertex {
        position: [x as f32, y as f32],
        color: color_arr,
    });

    for i in 0..segments {
        indices.push(segments as u32);
        indices.push(i as u32);
        indices.push(((i + 1) % segments) as u32);
    }

    (vertices, indices)
}
