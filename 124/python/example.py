"""
Example: Stack 1000 FITS images with progress callback.

Usage:
    python example.py /path/to/fits/files/ output.fits

Or to generate synthetic test data first:
    python example.py --generate /path/to/output/dir/
    python example.py /path/to/output/dir/ output.fits
"""

import os
import sys
import time
import argparse
import numpy as np

import astro_stack


def generate_synthetic_data(output_dir, num_images=1000, size=4096):
    """Generate synthetic FITS images with known sub-pixel offsets."""
    os.makedirs(output_dir, exist_ok=True)

    print(f"Generating {num_images} synthetic FITS images ({size}x{size})...")

    rng = np.random.RandomState(42)

    ref_data = rng.normal(1000.0, 50.0, (size, size)).astype(np.float32)
    ref_data += _generate_stars(size, rng)

    ref_path = os.path.join(output_dir, "frame_0000.fits")
    _write_fits(ref_path, ref_data)
    print(f"  Wrote: {ref_path}")

    for i in range(1, num_images):
        dx = rng.normal(0, 2.0)
        dy = rng.normal(0, 2.0)

        shifted = _shift_image(ref_data, dx, dy)
        noise = rng.normal(0, 30.0, (size, size)).astype(np.float32)
        shifted = shifted + noise

        path = os.path.join(output_dir, f"frame_{i:04d}.fits")
        _write_fits(path, shifted)

        if i % 100 == 0:
            print(f"  Generated {i}/{num_images} frames...")

    print(f"Done. {num_images} frames in {output_dir}")
    return True


def _generate_stars(size, rng, num_stars=500):
    """Generate synthetic star field."""
    stars = np.zeros((size, size), dtype=np.float32)
    for _ in range(num_stars):
        x = rng.randint(10, size - 10)
        y = rng.randint(10, size - 10)
        flux = rng.uniform(100, 5000)
        sigma = rng.uniform(1.0, 3.0)

        half = int(sigma * 5) + 1
        x0 = max(0, x - half)
        x1 = min(size, x + half + 1)
        y0 = max(0, y - half)
        y1 = min(size, y + half + 1)

        yy, xx = np.mgrid[y0:y1, x0:x1]
        dist2 = (xx - x) ** 2 + (yy - y) ** 2
        stars[y0:y1, x0:x1] += flux * np.exp(-dist2 / (2 * sigma ** 2))

    return stars


def _shift_image(data, dx, dy):
    """Sub-pixel shift using bilinear interpolation."""
    h, w = data.shape
    y_idx, x_idx = np.mgrid[0:h, 0:w].astype(np.float32)
    x_src = x_idx - dx
    y_src = y_idx - dy

    x0 = np.floor(x_src).astype(np.int32)
    y0 = np.floor(y_src).astype(np.int32)
    x1 = x0 + 1
    y1 = y0 + 1

    x0 = np.clip(x0, 0, w - 1)
    x1 = np.clip(x1, 0, w - 1)
    y0 = np.clip(y0, 0, h - 1)
    y1 = np.clip(y1, 0, h - 1)

    sx = x_src - np.floor(x_src)
    sy = y_src - np.floor(y_src)

    v00 = data[y0, x0]
    v10 = data[y0, x1]
    v01 = data[y1, x0]
    v11 = data[y1, x1]

    v0 = v00 * (1 - sx) + v10 * sx
    v1 = v01 * (1 - sx) + v11 * sx
    result = v0 * (1 - sy) + v1 * sy
    return result.astype(np.float32)


def _write_fits(filepath, data):
    """Write numpy array to FITS file using the C++ reader."""
    import astro_stack
    img = astro_stack.Image(data.shape[1], data.shape[0])
    img.from_numpy(data)
    astro_stack.write_fits(filepath, img)


def collect_fits_files(input_dir):
    """Collect all FITS files from a directory."""
    files = []
    for f in sorted(os.listdir(input_dir)):
        if f.lower().endswith(('.fits', '.fit', '.fts')):
            files.append(os.path.join(input_dir, f))
    return files


def progress_callback(current, total, stage):
    """Progress callback for the stacking process."""
    pct = 100.0 * current / max(total, 1)
    bar_len = 40
    filled = int(bar_len * current / max(total, 1))
    bar = '█' * filled + '░' * (bar_len - filled)
    print(f"\r  [{bar}] {current}/{total} ({pct:.1f}%) {stage}          ", end='', flush=True)
    if current >= total:
        print()


def main():
    parser = argparse.ArgumentParser(
        description="Stack astronomical FITS images with CUDA acceleration")
    parser.add_argument("input", help="Input directory containing FITS files, or output dir for --generate")
    parser.add_argument("output", nargs="?", default="stacked.fits", help="Output FITS file path")
    parser.add_argument("--generate", action="store_true", help="Generate synthetic test data")
    parser.add_argument("--num-images", type=int, default=1000, help="Number of images to generate")
    parser.add_argument("--size", type=int, default=4096, help="Image size for synthetic data")
    parser.add_argument("--method", choices=["mean", "median", "sigma"], default="sigma",
                        help="Stacking method")
    parser.add_argument("--no-cuda", action="store_true", help="Disable CUDA (use CPU only)")
    parser.add_argument("--reference", type=int, default=0, help="Reference image index")
    args = parser.parse_args()

    if args.generate:
        generate_synthetic_data(args.input, args.num_images, args.size)
        return

    files = collect_fits_files(args.input)
    if not files:
        print(f"ERROR: No FITS files found in {args.input}")
        sys.exit(1)

    print(f"Found {len(files)} FITS files")
    print(f"Stacking method: {args.method}")
    print(f"CUDA: {'enabled' if not args.no_cuda else 'disabled'}")

    method_map = {
        "mean": astro_stack.StackMethod.MEAN,
        "median": astro_stack.StackMethod.MEDIAN,
        "sigma": astro_stack.StackMethod.SIGMA_CLIP,
    }

    config = astro_stack.StackConfig()
    config.method = method_map[args.method]
    config.use_cuda = not args.no_cuda
    config.reference_index = args.reference
    config.sigma_lo = 3.0
    config.sigma_hi = 3.0

    print(f"\nStarting stacking of {len(files)} images...")
    t0 = time.time()

    result = astro_stack.stack_images(files, config, progress_callback)

    t1 = time.time()
    print(f"\nStacking completed in {t1 - t0:.1f} seconds")
    print(f"Output image: {result.width}x{result.height}")

    astro_stack.write_fits(args.output, result)
    print(f"Output saved to: {args.output}")


if __name__ == "__main__":
    main()
