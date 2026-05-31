#include <pybind11/pybind11.h>
#include <pybind11/numpy.h>
#include <pybind11/stl.h>
#include "../include/matrix.h"
#include "../include/sparse_matrix.h"

namespace py = pybind11;
using namespace cuda_matrix;

PYBIND11_MODULE(_cuda_matrix_core, m) {
    m.doc() = "CUDA Matrix Operations Core Module";

    py::class_<Matrix>(m, "Matrix")
        .def(py::init<>())
        .def(py::init<size_t, size_t, bool>(), py::arg("rows"), py::arg("cols"), py::arg("on_gpu") = true)
        .def(py::init([](size_t rows, size_t cols, py::array_t<float> data, bool on_gpu = true) {
            py::buffer_info buf = data.request();
            if (buf.ndim != 2) {
                throw std::runtime_error("Input must be a 2D array");
            }
            if (static_cast<size_t>(buf.shape[0]) != rows || static_cast<size_t>(buf.shape[1]) != cols) {
                throw std::runtime_error("Shape mismatch");
            }
            return std::make_unique<Matrix>(rows, cols, static_cast<float*>(buf.ptr), on_gpu);
        }), py::arg("rows"), py::arg("cols"), py::arg("data"), py::arg("on_gpu") = true)
        .def_property_readonly("rows", &Matrix::rows)
        .def_property_readonly("cols", &Matrix::cols)
        .def_property_readonly("size", &Matrix::size)
        .def_property_readonly("on_gpu", &Matrix::on_gpu)
        .def("to_cpu", &Matrix::to_cpu)
        .def("to_gpu", &Matrix::to_gpu)
        .def("numpy", [](const Matrix& m) {
            size_t rows = m.rows();
            size_t cols = m.cols();
            const float* data = m.host_data();
            py::array_t<float> arr({static_cast<pybind11::ssize_t>(rows), static_cast<pybind11::ssize_t>(cols)});
            py::buffer_info buf = arr.request();
            std::memcpy(buf.ptr, data, rows * cols * sizeof(float));
            return arr;
        })
        .def_static("zeros", &Matrix::zeros, py::arg("rows"), py::arg("cols"), py::arg("on_gpu") = true)
        .def_static("ones", &Matrix::ones, py::arg("rows"), py::arg("cols"), py::arg("on_gpu") = true)
        .def_static("identity", &Matrix::identity, py::arg("n"), py::arg("on_gpu") = true)
        .def_static("random", &Matrix::random, py::arg("rows"), py::arg("cols"), py::arg("min") = 0.0f, py::arg("max") = 1.0f, py::arg("on_gpu") = true)
        .def_static("get_available_gpu_memory", &Matrix::get_available_gpu_memory)
        .def_static("get_total_gpu_memory", &Matrix::get_total_gpu_memory);

    py::class_<SparseMatrixCSR>(m, "SparseMatrixCSR")
        .def(py::init<>())
        .def(py::init<size_t, size_t, size_t, bool>(), py::arg("rows"), py::arg("cols"), py::arg("nnz"), py::arg("on_gpu") = true)
        .def(py::init([](size_t rows, size_t cols, py::array_t<int> row_ptr, py::array_t<int> col_idx, py::array_t<float> values, bool on_gpu = true) {
            py::buffer_info row_buf = row_ptr.request();
            py::buffer_info col_buf = col_idx.request();
            py::buffer_info val_buf = values.request();

            if (row_buf.ndim != 1 || col_buf.ndim != 1 || val_buf.ndim != 1) {
                throw std::runtime_error("All arrays must be 1D");
            }
            if (static_cast<size_t>(row_buf.shape[0]) != rows + 1) {
                throw std::runtime_error("row_ptr size must be rows + 1");
            }
            if (col_buf.shape[0] != val_buf.shape[0]) {
                throw std::runtime_error("col_idx and values must have the same size");
            }

            std::vector<int> row_ptr_vec(static_cast<int*>(row_buf.ptr), static_cast<int*>(row_buf.ptr) + row_buf.shape[0]);
            std::vector<int> col_idx_vec(static_cast<int*>(col_buf.ptr), static_cast<int*>(col_buf.ptr) + col_buf.shape[0]);
            std::vector<float> values_vec(static_cast<float*>(val_buf.ptr), static_cast<float*>(val_buf.ptr) + val_buf.shape[0]);

            return std::make_unique<SparseMatrixCSR>(rows, cols, row_ptr_vec, col_idx_vec, values_vec, on_gpu);
        }), py::arg("rows"), py::arg("cols"), py::arg("row_ptr"), py::arg("col_idx"), py::arg("values"), py::arg("on_gpu") = true)
        .def_property_readonly("rows", &SparseMatrixCSR::rows)
        .def_property_readonly("cols", &SparseMatrixCSR::cols)
        .def_property_readonly("nnz", &SparseMatrixCSR::nnz)
        .def_property_readonly("on_gpu", &SparseMatrixCSR::on_gpu)
        .def_property_readonly("density", &SparseMatrixCSR::density)
        .def("row_ptr", [](const SparseMatrixCSR& m) {
            auto vec = m.row_ptr_cpu();
            return py::array_t<int>(vec.size(), vec.data());
        })
        .def("col_idx", [](const SparseMatrixCSR& m) {
            auto vec = m.col_idx_cpu();
            return py::array_t<int>(vec.size(), vec.data());
        })
        .def("values", [](const SparseMatrixCSR& m) {
            auto vec = m.values_cpu();
            return py::array_t<float>(vec.size(), vec.data());
        })
        .def("to_cpu", &SparseMatrixCSR::to_cpu)
        .def("to_gpu", &SparseMatrixCSR::to_gpu)
        .def("to_dense", &SparseMatrixCSR::to_dense)
        .def_static("from_dense", &SparseMatrixCSR::from_dense, py::arg("dense"), py::arg("threshold") = 1e-6f)
        .def_static("random", &SparseMatrixCSR::random, py::arg("rows"), py::arg("cols"), py::arg("density"), py::arg("min_val") = 0.0f, py::arg("max_val") = 1.0f, py::arg("on_gpu") = true)
        .def_static("identity", &SparseMatrixCSR::identity, py::arg("n"), py::arg("on_gpu") = true)
        .def_static("diag", [](py::array_t<float> diag_values, bool on_gpu = true) {
            py::buffer_info buf = diag_values.request();
            if (buf.ndim != 1) {
                throw std::runtime_error("Input must be a 1D array");
            }
            std::vector<float> vec(static_cast<float*>(buf.ptr), static_cast<float*>(buf.ptr) + buf.shape[0]);
            return SparseMatrixCSR::diag(vec, on_gpu);
        }, py::arg("diag_values"), py::arg("on_gpu") = true);

    m.def("matmul", &multiply, "Matrix multiplication", py::arg("A"), py::arg("B"));
    m.def("transpose", &transpose, "Matrix transpose", py::arg("A"));
    m.def("inverse", &inverse, "Matrix inverse", py::arg("A"));
    m.def("eigenvalues", &eigenvalues, "Compute eigenvalues and eigenvectors",
          py::arg("A"), py::arg("max_iter") = 1000, py::arg("tol") = 1e-6f);

    m.def("spmv", &spmv, "Sparse matrix-vector multiplication", py::arg("A"), py::arg("x"));
    m.def("spmm", &spmm, "Sparse matrix-dense matrix multiplication", py::arg("A"), py::arg("B"));
    m.def("sparse_transpose", &sparse_transpose, "Sparse matrix transpose", py::arg("A"));
    m.def("sparse_add", &sparse_add, "Sparse matrix addition", py::arg("A"), py::arg("B"));
    m.def("sparse_matmul_dense", &sparse_matmul_dense, "Sparse-dense matrix multiplication", py::arg("A"), py::arg("B"));
}
