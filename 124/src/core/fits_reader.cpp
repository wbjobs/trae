#include "astro_stack/fits_reader.h"

#include <fitsio.h>
#include <stdexcept>
#include <cstring>

namespace astro_stack {

Image FitsReader::read(const std::string& filepath) {
    int status = 0;
    fitsfile* fptr = nullptr;

    if (fits_open_file(&fptr, filepath.c_str(), READONLY, &status)) {
        char err_msg[FLEN_ERRMSG];
        fits_get_errstatus(status, err_msg);
        throw std::runtime_error("Failed to open FITS file: " + filepath + " - " + err_msg);
    }

    int bitpix = 0;
    int naxis = 0;
    long naxes[2] = {0, 0};
    if (fits_get_img_param(fptr, 2, &bitpix, &naxis, naxes, &status)) {
        fits_close_file(fptr, &status);
        throw std::runtime_error("Failed to read FITS image parameters");
    }

    if (naxis != 2) {
        fits_close_file(fptr, &status);
        throw std::runtime_error("FITS file must be 2-dimensional");
    }

    long width = naxes[0];
    long height = naxes[1];

    Image img(static_cast<int>(width), static_cast<int>(height));

    long first_elem = 1;
    long num_elem = width * height;
    int anynul = 0;
    float nulval = 0.0f;

    if (fits_read_img(fptr, TFLOAT, first_elem, num_elem, &nulval,
                       img.data.data(), &anynul, &status)) {
        fits_close_file(fptr, &status);
        throw std::runtime_error("Failed to read FITS image data");
    }

    fits_close_file(fptr, &status);
    return img;
}

std::vector<Image> FitsReader::readBatch(const std::vector<std::string>& filepaths,
                                          ProgressCallback callback) {
    std::vector<Image> images;
    images.reserve(filepaths.size());

    int total = static_cast<int>(filepaths.size());
    for (int i = 0; i < total; ++i) {
        images.push_back(read(filepaths[i]));
        if (callback) {
            callback(i + 1, total, "Reading FITS files");
        }
    }
    return images;
}

void FitsReader::write(const std::string& filepath, const Image& image) {
    int status = 0;
    fitsfile* fptr = nullptr;

    if (fits_create_file(&fptr, filepath.c_str(), &status)) {
        char err_msg[FLEN_ERRMSG];
        fits_get_errstatus(status, err_msg);
        throw std::runtime_error("Failed to create FITS file: " + filepath + " - " + err_msg);
    }

    long naxes[2] = {image.width, image.height};
    if (fits_create_img(fptr, FLOAT_IMG, 2, naxes, &status)) {
        fits_close_file(fptr, &status);
        throw std::runtime_error("Failed to create FITS image");
    }

    long first_elem = 1;
    long num_elem = image.width * image.height;

    if (fits_write_img(fptr, TFLOAT, first_elem, num_elem,
                        const_cast<float*>(image.data.data()), &status)) {
        fits_close_file(fptr, &status);
        throw std::runtime_error("Failed to write FITS image data");
    }

    fits_close_file(fptr, &status);
}

} // namespace astro_stack
