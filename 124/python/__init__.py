"""
AstroStack - Astronomical Image Stacking Library

A high-performance C++/CUDA library for stacking astronomical FITS images
with sub-pixel registration using cross-correlation.
"""

from .astro_stack import (
    Image,
    Offset,
    StackMethod,
    StackConfig,
    CrossCorrelationResult,
    CrossCorrelator,
    CpuCrossCorrelator,
    Stacker,
    shift_image,
    cubic_convolve_interp,
    read_fits,
    read_fits_batch,
    write_fits,
    stack_images,
)

try:
    from .astro_stack import CudaCrossCorrelator
    HAS_CUDA = True
except ImportError:
    HAS_CUDA = False

__version__ = "1.0.0"
__all__ = [
    "Image",
    "Offset",
    "StackMethod",
    "StackConfig",
    "CrossCorrelationResult",
    "CrossCorrelator",
    "CpuCrossCorrelator",
    "CudaCrossCorrelator",
    "Stacker",
    "shift_image",
    "cubic_convolve_interp",
    "read_fits",
    "read_fits_batch",
    "write_fits",
    "stack_images",
    "HAS_CUDA",
]
