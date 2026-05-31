#include <pybind11/pybind11.h>
#include <pybind11/numpy.h>
#include <pybind11/stl.h>
#include "svd_solver.hpp"
#include <vector>

namespace py = pybind11;

std::tuple<py::array_t<float>, py::array_t<float>, py::array_t<float>>
sparse_svd(py::array_t<float> data,
           py::array_t<int> indices,
           py::array_t<int> indptr,
           int rows,
           int cols,
           int k,
           int n_iter,
           int oversamples,
           bool use_fp16)
{
    py::buffer_info data_buf = data.request();
    py::buffer_info indices_buf = indices.request();
    py::buffer_info indptr_buf = indptr.request();

    if (data_buf.ndim != 1 || indices_buf.ndim != 1 || indptr_buf.ndim != 1)
        throw std::runtime_error("Inputs must be 1D arrays");

    int nnz = data_buf.shape[0];
    if (indices_buf.shape[0] != nnz)
        throw std::runtime_error("indices size must match data size");
    if (indptr_buf.shape[0] != rows + 1)
        throw std::runtime_error("indptr size must be rows + 1");

    float* data_ptr = static_cast<float*>(data_buf.ptr);
    int* indices_ptr = static_cast<int*>(indices_buf.ptr);
    int* indptr_ptr = static_cast<int*>(indptr_buf.ptr);

    std::vector<int> h_row_ptr(indptr_ptr, indptr_ptr + rows + 1);
    std::vector<int> h_col_idx(indices_ptr, indices_ptr + nnz);
    std::vector<float> h_values(data_ptr, data_ptr + nnz);

    CSRMatrix A(rows, cols, nnz, h_row_ptr, h_col_idx, h_values);

    SVDSolver solver(k, n_iter, oversamples, 1e-6f, use_fp16);
    SVDResult result = solver.compute(A);

    int k_out = result.k;
    if (k_out == 0) {
        auto U = py::array_t<float>({result.m, 0});
        auto S = py::array_t<float>({0});
        auto V = py::array_t<float>({result.n, 0});
        return std::make_tuple(U, S, V);
    }

    auto U = py::array_t<float>({result.m, k_out});
    std::memcpy(U.mutable_data(), result.U.data(), result.m * k_out * sizeof(float));

    auto S = py::array_t<float>({k_out});
    std::memcpy(S.mutable_data(), result.S.data(), k_out * sizeof(float));

    auto V = py::array_t<float>({result.n, k_out});
    std::memcpy(V.mutable_data(), result.V.data(), result.n * k_out * sizeof(float));

    return std::make_tuple(U, S, V);
}

PYBIND11_MODULE(sparse_svd, m) {
    m.doc() = "Sparse SVD decomposition using CUDA + Thrust (supports FP16 mixed precision)";

    m.def("sparse_svd", &sparse_svd,
          "Compute SVD of a sparse CSR matrix",
          py::arg("data"),
          py::arg("indices"),
          py::arg("indptr"),
          py::arg("rows"),
          py::arg("cols"),
          py::arg("k") = 10,
          py::arg("n_iter") = 2,
          py::arg("oversamples") = 10,
          py::arg("use_fp16") = false);
}
