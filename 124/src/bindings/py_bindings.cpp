#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/numpy.h>
#include <pybind11/functional.h>

#include "astro_stack/types.h"
#include "astro_stack/fits_reader.h"
#include "astro_stack/cross_correlation.h"
#include "astro_stack/stacker.h"

#include <iostream>

namespace py = pybind11;
using namespace astro_stack;

namespace {

py::array_t<float> imageToNumpy(const Image& img) {
    py::array_t<float> result({img.height, img.width});
    auto buf = result.mutable_data();
    std::copy(img.data.begin(), img.data.end(), buf);
    return result;
}

Image numpyToImage(py::array_t<float> arr) {
    if (arr.ndim() != 2) {
        throw std::runtime_error("Expected 2D array");
    }
    int h = static_cast<int>(arr.shape(0));
    int w = static_cast<int>(arr.shape(1));
    Image img(w, h);
    auto buf = arr.data();
    std::copy(buf, buf + w * h, img.data.begin());
    return img;
}

} // anonymous namespace

PYBIND11_MODULE(astro_stack, m) {
    m.doc() = "Astronomical image stacking library with CUDA acceleration";

    py::class_<Offset>(m, "Offset")
        .def(py::init<>())
        .def(py::init<float, float, float>(),
             py::arg("dx"), py::arg("dy"), py::arg("confidence") = 0.0f)
        .def_readwrite("dx", &Offset::dx)
        .def_readwrite("dy", &Offset::dy)
        .def_readwrite("confidence", &Offset::confidence)
        .def("__repr__", [](const Offset& o) {
            return "<Offset dx=" + std::to_string(o.dx) +
                   " dy=" + std::to_string(o.dy) +
                   " conf=" + std::to_string(o.confidence) + ">";
        });

    py::class_<Image>(m, "Image")
        .def(py::init<>())
        .def(py::init<int, int>(), py::arg("width"), py::arg("height"))
        .def_readwrite("width", &Image::width)
        .def_readwrite("height", &Image::height)
        .def_property_readonly("data", [](const Image& img) -> py::array_t<float> {
            return imageToNumpy(img);
        })
        .def("from_numpy", [](Image& img, py::array_t<float> arr) {
            img = numpyToImage(arr);
        }, py::arg("array"))
        .def_static("from_file", &FitsReader::read, py::arg("filepath"))
        .def("save", &FitsReader::write, py::arg("filepath"))
        .def("__repr__", [](const Image& img) {
            return "<Image " + std::to_string(img.width) + "x" + std::to_string(img.height) + ">";
        });

    py::enum_<StackMethod>(m, "StackMethod")
        .value("MEAN", StackMethod::MEAN)
        .value("MEDIAN", StackMethod::MEDIAN)
        .value("SIGMA_CLIP", StackMethod::SIGMA_CLIP)
        .export_values();

    py::class_<StackConfig>(m, "StackConfig")
        .def(py::init<>())
        .def_readwrite("method", &StackConfig::method)
        .def_readwrite("sigma_lo", &StackConfig::sigma_lo)
        .def_readwrite("sigma_hi", &StackConfig::sigma_hi)
        .def_readwrite("max_iterations", &StackConfig::max_iterations)
        .def_readwrite("reference_index", &StackConfig::reference_index)
        .def_readwrite("use_cuda", &StackConfig::use_cuda)
        .def_readwrite("tile_size", &StackConfig::tile_size);

    py::class_<CrossCorrelationResult>(m, "CrossCorrelationResult")
        .def_readonly("peak_x", &CrossCorrelationResult::peak_x)
        .def_readonly("peak_y", &CrossCorrelationResult::peak_y)
        .def_readonly("subpixel_dx", &CrossCorrelationResult::subpixel_dx)
        .def_readonly("subpixel_dy", &CrossCorrelationResult::subpixel_dy)
        .def_readonly("peak_value", &CrossCorrelationResult::peak_value);

    py::class_<CrossCorrelator>(m, "CrossCorrelator");

    py::class_<CpuCrossCorrelator, CrossCorrelator>(m, "CpuCrossCorrelator")
        .def(py::init<>())
        .def("compute", &CpuCrossCorrelator::compute,
             py::arg("ref"), py::arg("ref_w"), py::arg("ref_h"),
             py::arg("target"), py::arg("target_w"), py::arg("target_h"))
        .def("compute_batch", &CpuCrossCorrelator::computeBatch,
             py::arg("reference"), py::arg("targets"),
             py::arg("callback") = py::none());

#ifdef USE_CUDA
    py::class_<CudaCrossCorrelator, CrossCorrelator>(m, "CudaCrossCorrelator")
        .def(py::init<>())
        .def("compute", &CudaCrossCorrelator::compute,
             py::arg("ref"), py::arg("ref_w"), py::arg("ref_h"),
             py::arg("target"), py::arg("target_w"), py::arg("target_h"))
        .def("compute_batch", &CudaCrossCorrelator::computeBatch,
             py::arg("reference"), py::arg("targets"),
             py::arg("callback") = py::none())
        .def("compute_batch_parallel", &CudaCrossCorrelator::computeBatchParallel,
             py::arg("reference"), py::arg("targets"),
             py::arg("max_batch_size") = 32,
             py::arg("callback") = py::none());
#endif

    py::class_<Stacker>(m, "Stacker")
        .def(py::init<>())
        .def(py::init<const StackConfig&>(), py::arg("config"))
        .def_property("config", &Stacker::config, &Stacker::setConfig)
        .def("stack", &Stacker::stack,
             py::arg("images"), py::arg("offsets"),
             py::arg("callback") = py::none())
        .def("stack_from_files", &Stacker::stackFromFiles,
             py::arg("filepaths"),
             py::arg("callback") = py::none());

    m.def("shift_image", &Stacker::shiftImage,
          py::arg("image"), py::arg("dx"), py::arg("dy"),
          "Shift an image by sub-pixel offset using cubic convolution interpolation");

    m.def("cubic_convolve_interp", &Stacker::cubicConvolveInterp,
          py::arg("image"), py::arg("x"), py::arg("y"),
          "Cubic convolution interpolation at sub-pixel position (x, y)");

    m.def("read_fits", &FitsReader::read,
          py::arg("filepath"),
          "Read a FITS file into an Image");

    m.def("read_fits_batch", &FitsReader::readBatch,
          py::arg("filepaths"), py::arg("callback") = py::none(),
          "Read multiple FITS files");

    m.def("write_fits", &FitsReader::write,
          py::arg("filepath"), py::arg("image"),
          "Write an Image to a FITS file");

    m.def("stack_images", [](
        const std::vector<std::string>& filepaths,
        const StackConfig& config,
        std::function<void(int, int, const std::string&)> callback) -> Image {

        Stacker stacker(config);

        if (callback) {
            int n = static_cast<int>(filepaths.size());
            int total_steps = n + n + 1;

            callback(0, total_steps, "Reading files");
            std::vector<Image> images;
            images.reserve(n);
            for (int i = 0; i < n; ++i) {
                images.push_back(FitsReader::read(filepaths[i]));
                callback(i + 1, total_steps, "Reading files");
            }

            callback(n + 1, total_steps, "Computing offsets");
            std::unique_ptr<CrossCorrelator> correlator;
            if (config.use_cuda) {
#ifdef USE_CUDA
                correlator = std::make_unique<CudaCrossCorrelator>();
#else
                correlator = std::make_unique<CpuCrossCorrelator>();
#endif
            } else {
                correlator = std::make_unique<CpuCrossCorrelator>();
            }

            int ref_idx = config.reference_index;
            if (ref_idx < 0 || ref_idx >= n) ref_idx = 0;

            std::vector<Offset> offsets;
            offsets.reserve(n);
            const Image& reference = images[ref_idx];
            for (int i = 0; i < n; ++i) {
                if (i == ref_idx) {
                    offsets.emplace_back(0.0f, 0.0f, 1.0f);
                } else {
                    auto result = correlator->compute(
                        reference.data.data(), reference.width, reference.height,
                        images[i].data.data(), images[i].width, images[i].height);
                    offsets.emplace_back(result.subpixel_dx, result.subpixel_dy, result.peak_value);
                }
                callback(n + 1 + i, total_steps,
                         "Computing offset " + std::to_string(i + 1) + "/" + std::to_string(n));
            }

            callback(n + n + 1, total_steps, "Stacking images");
            return stacker.stack(images, offsets, callback);
        }

        return stacker.stackFromFiles(filepaths, nullptr);
    },
    py::arg("filepaths"),
    py::arg("config") = StackConfig(),
    py::arg("callback") = py::none(),
    "Convenience function: stack FITS files with given config and optional progress callback");

#ifdef VERSION_INFO
    m.attr("__version__") = VERSION_INFO;
#else
    m.attr("__version__") = "1.0.0";
#endif
}
