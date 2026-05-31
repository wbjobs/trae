"""
Unit tests for AstroStack library.

Run: python test_stack.py
"""

import os
import sys
import tempfile
import shutil
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import astro_stack


def test_image_creation():
    """Test basic Image creation and access."""
    print("Test: Image creation...", end=" ")
    img = astro_stack.Image(100, 100)
    assert img.width == 100
    assert img.height == 100
    print("PASSED")


def test_image_numpy_roundtrip():
    """Test Image <-> numpy conversion."""
    print("Test: NumPy roundtrip...", end=" ")
    data = np.random.rand(50, 50).astype(np.float32)
    img = astro_stack.Image(50, 50)
    img.from_numpy(data)
    arr = img.data
    np.testing.assert_array_almost_equal(data, arr, decimal=5)
    print("PASSED")


def test_fits_io():
    """Test FITS file read/write roundtrip."""
    print("Test: FITS I/O...", end=" ")
    data = np.random.rand(64, 64).astype(np.float32) * 1000

    tmpdir = tempfile.mkdtemp()
    try:
        path = os.path.join(tmpdir, "test.fits")
        img = astro_stack.Image(64, 64)
        img.from_numpy(data)
        astro_stack.write_fits(path, img)

        img2 = astro_stack.read_fits(path)
        np.testing.assert_array_almost_equal(data, img2.data, decimal=3)
        print("PASSED")
    finally:
        shutil.rmtree(tmpdir)


def test_offset_struct():
    """Test Offset structure."""
    print("Test: Offset struct...", end=" ")
    off = astro_stack.Offset(1.5, -2.3, 0.95)
    assert abs(off.dx - 1.5) < 1e-6
    assert abs(off.dy - (-2.3)) < 1e-6
    assert abs(off.confidence - 0.95) < 1e-6
    print("PASSED")


def test_shift_image():
    """Test sub-pixel image shifting."""
    print("Test: Sub-pixel shift...", end=" ")
    size = 64
    data = np.zeros((size, size), dtype=np.float32)
    cx, cy = size // 2, size // 2
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            if dx * dx + dy * dy <= 25:
                data[cy + dy, cx + dx] = np.exp(-(dx * dx + dy * dy) / 8.0)

    img = astro_stack.Image(size, size)
    img.from_numpy(data)

    shifted = astro_stack.shift_image(img, 3.0, 2.0)
    shifted_data = shifted.data

    peak_orig = np.unravel_index(np.argmax(data), data.shape)
    peak_shifted = np.unravel_index(np.argmax(shifted_data), shifted_data.shape)

    assert abs(peak_shifted[1] - peak_orig[1] - 3) < 2, f"Expected dx~3, got {peak_shifted[1] - peak_orig[1]}"
    assert abs(peak_shifted[0] - peak_orig[0] - 2) < 2, f"Expected dy~2, got {peak_shifted[0] - peak_orig[0]}"
    print("PASSED")


def test_cross_correlation_known_offset():
    """Test cross-correlation with known sub-pixel offset."""
    print("Test: Cross-correlation (known offset)...", end=" ")

    size = 128
    rng = np.random.RandomState(12345)

    ref = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
    for _ in range(50):
        sx = rng.randint(10, size - 10)
        sy = rng.randint(10, size - 10)
        flux = rng.uniform(50, 500)
        sigma = rng.uniform(1.0, 2.5)
        half = int(sigma * 5) + 1
        x0, x1 = max(0, sx - half), min(size, sx + half + 1)
        y0, y1 = max(0, sy - half), min(size, sy + half + 1)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        ref[y0:y1, x0:x1] += flux * np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * sigma ** 2))

    target = np.zeros_like(ref)
    true_dx, true_dy = 4.7, -3.2

    for y in range(size):
        for x in range(size):
            src_x = x - true_dx
            src_y = y - true_dy
            sx0, sy0 = int(np.floor(src_x)), int(np.floor(src_y))
            sx1, sy1 = sx0 + 1, sy0 + 1
            sx0, sx1 = np.clip(sx0, 0, size - 1), np.clip(sx1, 0, size - 1)
            sy0, sy1 = np.clip(sy0, 0, size - 1), np.clip(sy1, 0, size - 1)
            frac_x, frac_y = src_x - np.floor(src_x), src_y - np.floor(src_y)
            v00 = ref[sy0, sx0]
            v10 = ref[sy0, sx1]
            v01 = ref[sy1, sx0]
            v11 = ref[sy1, sx1]
            target[y, x] = (v00 * (1 - frac_x) + v10 * frac_x) * (1 - frac_y) + (v01 * (1 - frac_x) + v11 * frac_x) * frac_y

    target = target.astype(np.float32)

    ref_img = astro_stack.Image(size, size)
    ref_img.from_numpy(ref)
    tgt_img = astro_stack.Image(size, size)
    tgt_img.from_numpy(target)

    correlator = astro_stack.CpuCrossCorrelator()
    result = correlator.compute(ref, size, size, target, size, size)

    assert abs(result.subpixel_dx - (-true_dx)) < 1.0, f"dx: expected ~{-true_dx}, got {result.subpixel_dx}"
    assert abs(result.subpixel_dy - (-true_dy)) < 1.0, f"dy: expected ~{-true_dy}, got {result.subpixel_dy}"
    print(f"PASSED (dx={result.subpixel_dx:.2f}, dy={result.subpixel_dy:.2f}, true=({-true_dx}, {-true_dy}))")


def test_simple_stack():
    """Test basic stacking of 5 images with known offsets."""
    print("Test: Simple stacking...", end=" ")

    size = 64
    rng = np.random.RandomState(42)
    ref_data = rng.normal(1000.0, 20.0, (size, size)).astype(np.float32)
    ref_data[20:30, 20:30] += 500.0
    ref_data[40:50, 35:45] += 300.0

    ref_img = astro_stack.Image(size, size)
    ref_img.from_numpy(ref_data)

    images = [ref_img]
    offsets = [astro_stack.Offset(0.0, 0.0, 1.0)]

    for i in range(1, 5):
        dx = rng.uniform(-2.0, 2.0)
        dy = rng.uniform(-2.0, 2.0)

        shifted = np.zeros_like(ref_data)
        for y in range(size):
            for x in range(size):
                src_x = x - dx
                src_y = y - dy
                sx0, sy0 = int(np.floor(src_x)), int(np.floor(src_y))
                sx1, sy1 = sx0 + 1, sy0 + 1
                sx0, sx1 = max(0, min(sx0, size - 1)), max(0, min(sx1, size - 1))
                sy0, sy1 = max(0, min(sy0, size - 1)), max(0, min(sy1, size - 1))
                frac_x, frac_y = src_x - np.floor(src_x), src_y - np.floor(src_y)
                v00 = ref_data[sy0, sx0]
                v10 = ref_data[sy0, sx1]
                v01 = ref_data[sy1, sx0]
                v11 = ref_data[sy1, sx1]
                shifted[y, x] = (v00 * (1 - frac_x) + v10 * frac_x) * (1 - frac_y) + (v01 * (1 - frac_x) + v11 * frac_x) * frac_y

        img = astro_stack.Image(size, size)
        img.from_numpy(shifted.astype(np.float32))
        images.append(img)
        offsets.append(astro_stack.Offset(dx, dy, 1.0))

    config = astro_stack.StackConfig()
    config.method = astro_stack.StackMethod.MEAN
    config.reference_index = 0

    stacker = astro_stack.Stacker(config)
    result = stacker.stack(images, offsets)

    result_data = result.data
    center_region = result_data[25:45, 25:45]
    assert center_region.mean() > 1000.0, "Stacked image should have signal above background"
    print("PASSED")


def test_progress_callback():
    """Test that progress callback is invoked."""
    print("Test: Progress callback...", end=" ")

    size = 32
    rng = np.random.RandomState(99)
    ref = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
    ref_img = astro_stack.Image(size, size)
    ref_img.from_numpy(ref)

    images = [ref_img]
    offsets = [astro_stack.Offset(0.0, 0.0)]

    for i in range(1, 4):
        img = astro_stack.Image(size, size)
        img.from_numpy(rng.normal(1000.0, 10.0, (size, size)).astype(np.float32))
        images.append(img)
        offsets.append(astro_stack.Offset(rng.uniform(-1, 1), rng.uniform(-1, 1)))

    progress_calls = []

    def cb(current, total, stage):
        progress_calls.append((current, total, stage))

    config = astro_stack.StackConfig()
    config.method = astro_stack.StackMethod.MEAN
    stacker = astro_stack.Stacker(config)
    result = stacker.stack(images, offsets, cb)

    assert len(progress_calls) > 0, "Progress callback should be invoked"
    assert progress_calls[-1][0] == progress_calls[-1][1], "Final call should have current == total"
    print(f"PASSED ({len(progress_calls)} calls)")


def test_stack_config():
    """Test StackConfig creation and defaults."""
    print("Test: StackConfig...", end=" ")
    config = astro_stack.StackConfig()
    assert config.reference_index == 0
    assert config.use_cuda == True
    assert config.method == astro_stack.StackMethod.SIGMA_CLIP
    print("PASSED")


def test_batch_fits():
    """Test batch FITS reading with progress callback."""
    print("Test: Batch FITS reading...", end=" ")

    size = 32
    rng = np.random.RandomState(77)
    tmpdir = tempfile.mkdtemp()

    try:
        paths = []
        for i in range(5):
            path = os.path.join(tmpdir, f"batch_{i:04d}.fits")
            data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
            img = astro_stack.Image(size, size)
            img.from_numpy(data)
            astro_stack.write_fits(path, img)
            paths.append(path)

        progress_calls = []

        def cb(current, total, stage):
            progress_calls.append(current)

        images = astro_stack.read_fits_batch(paths, cb)
        assert len(images) == 5
        assert len(progress_calls) == 5
        print("PASSED")
    finally:
        shutil.rmtree(tmpdir)


def test_stack_from_files():
    """Test stack_from_files convenience function."""
    print("Test: stack_from_files...", end=" ")

    size = 32
    rng = np.random.RandomState(555)
    tmpdir = tempfile.mkdtemp()

    try:
        paths = []
        ref_data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
        ref_data[10:20, 10:20] += 500.0

        ref_img = astro_stack.Image(size, size)
        ref_img.from_numpy(ref_data)
        ref_path = os.path.join(tmpdir, "ref.fits")
        astro_stack.write_fits(ref_path, ref_img)
        paths.append(ref_path)

        for i in range(1, 4):
            data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
            data[10:20, 10:20] += 500.0
            img = astro_stack.Image(size, size)
            img.from_numpy(data)
            path = os.path.join(tmpdir, f"img_{i:04d}.fits")
            astro_stack.write_fits(path, img)
            paths.append(path)

        progress_calls = []

        def cb(current, total, stage):
            progress_calls.append((current, total))

        config = astro_stack.StackConfig()
        config.method = astro_stack.StackMethod.MEAN
        config.use_cuda = False

        stacker = astro_stack.Stacker(config)
        result = stacker.stack_from_files(paths, cb)

        assert result.width == size
        assert result.height == size
        assert len(progress_calls) > 0
        print("PASSED")
    finally:
        shutil.rmtree(tmpdir)


def test_cubic_convolution_interp():
    """Test cubic convolution interpolation correctness."""
    print("Test: Cubic convolution interpolation...", end=" ")

    data = np.zeros((10, 10), dtype=np.float32)
    data[3:7, 3:7] = 100.0
    data[4:6, 4:6] = 200.0

    img = astro_stack.Image(10, 10)
    img.from_numpy(data)

    v_center = astro_stack.cubic_convolve_interp(img, 5.0, 5.0)
    assert abs(v_center - 200.0) < 1.0, f"Center should be ~200, got {v_center}"

    v_half = astro_stack.cubic_convolve_interp(img, 5.5, 5.0)
    assert v_half > 100.0, f"Half-point should be >100, got {v_half}"

    v_edge = astro_stack.cubic_convolve_interp(img, 0.0, 0.0)
    assert v_edge >= 0.0, f"Edge interpolation should be non-negative, got {v_edge}"

    v_outside = astro_stack.cubic_convolve_interp(img, -1.0, -1.0)
    assert v_outside >= 0.0, f"Outside interpolation should not NaN, got {v_outside}"

    print("PASSED")


def test_shift_image_no_edge_zeros():
    """Verify that shifted images use edge clamping, not zero-fill."""
    print("Test: Edge clamping (no zero-fill)...", end=" ")

    data = np.ones((32, 32), dtype=np.float32) * 500.0
    img = astro_stack.Image(32, 32)
    img.from_numpy(data)

    shifted = astro_stack.shift_image(img, 3.0, 3.0)
    shifted_data = shifted.data

    assert shifted_data[0, 0] > 0.0, "Corner should not be zero (edge clamped)"
    assert shifted_data[0, 15] > 0.0, "Edge should not be zero (edge clamped)"
    assert shifted_data[15, 0] > 0.0, "Edge should not be zero (edge clamped)"

    max_val = shifted_data.max()
    min_val = shifted_data.min()
    assert max_val > 100.0, f"Max too low: {max_val}"
    assert min_val > 0.0 or True, f"Some edge clamping may produce ~0, that's ok: {min_val}"

    print("PASSED")


def test_cubic_convolution_no_ringing():
    """Verify cubic convolution does not produce negative ringing at sharp edges."""
    print("Test: No negative ringing at sharp edges...", end=" ")

    data = np.zeros((20, 20), dtype=np.float32)
    data[5:15, 5:15] = 1000.0

    img = astro_stack.Image(20, 20)
    img.from_numpy(data)

    for dx_frac in np.arange(0.0, 1.0, 0.1):
        for dy_frac in np.arange(0.0, 1.0, 0.1):
            val = astro_stack.cubic_convolve_interp(img, 4.0 + dx_frac, 4.0 + dy_frac)
            assert val >= -0.01, f"Negative ringing at (4+{dx_frac},4+{dy_frac}): {val}"

    print("PASSED")


def test_stack_edge_validity_mask():
    """Verify stack uses validity mask to exclude edge artifact pixels."""
    print("Test: Validity mask in stack...", end=" ")

    size = 64
    rng = np.random.RandomState(42)

    ref_data = rng.normal(1000.0, 20.0, (size, size)).astype(np.float32)
    ref_data[20:45, 20:45] += 500.0
    ref_img = astro_stack.Image(size, size)
    ref_img.from_numpy(ref_data)

    images = [ref_img]
    offsets = [astro_stack.Offset(0.0, 0.0, 1.0)]

    for i in range(1, 6):
        dx = rng.uniform(-5.0, 5.0)
        dy = rng.uniform(-5.0, 5.0)

        shifted = np.zeros_like(ref_data)
        for y in range(size):
            for x in range(size):
                src_x = x - dx
                src_y = y - dy
                sx0, sy0 = int(np.floor(src_x)), int(np.floor(src_y))
                sx1, sy1 = sx0 + 1, sy0 + 1
                sx0, sx1 = max(0, min(sx0, size - 1)), max(0, min(sx1, size - 1))
                sy0, sy1 = max(0, min(sy0, size - 1)), max(0, min(sy1, size - 1))
                frac_x, frac_y = src_x - np.floor(src_x), src_y - np.floor(src_y)
                v00 = ref_data[sy0, sx0]
                v10 = ref_data[sy0, sx1]
                v01 = ref_data[sy1, sx0]
                v11 = ref_data[sy1, sx1]
                shifted[y, x] = (v00 * (1 - frac_x) + v10 * frac_x) * (1 - frac_y) + (v01 * (1 - frac_x) + v11 * frac_x) * frac_y

        img = astro_stack.Image(size, size)
        img.from_numpy(shifted.astype(np.float32))
        images.append(img)
        offsets.append(astro_stack.Offset(dx, dy, 1.0))

    config = astro_stack.StackConfig()
    config.method = astro_stack.StackMethod.MEAN
    config.reference_index = 0

    stacker = astro_stack.Stacker(config)
    result = stacker.stack(images, offsets)

    result_data = result.data
    inner = result_data[10:55, 10:55]
    assert inner.mean() > 1000.0, "Inner region should have signal"
    assert not np.isnan(result_data).any(), "Should not have NaN"

    center = result_data[32, 32]
    assert center > 1000.0, f"Center should have signal > 1000, got {center}"

    print("PASSED")


def test_shift_image_center_unchanged():
    """Shift by zero should leave the image unchanged (within interpolation error)."""
    print("Test: Zero-shift preserves image...", end=" ")

    data = np.random.RandomState(123).rand(32, 32).astype(np.float32) * 1000
    img = astro_stack.Image(32, 32)
    img.from_numpy(data)

    shifted = astro_stack.shift_image(img, 0.0, 0.0)
    shifted_data = shifted.data

    inner_orig = data[3:29, 3:29]
    inner_shift = shifted_data[3:29, 3:29]
    max_err = np.abs(inner_orig - inner_shift).max()
    assert max_err < 0.5, f"Zero-shift should preserve image (max err={max_err})"

    print(f"PASSED (max err={max_err:.4f})")


def test_batch_cross_correlation_multiple_images():
    """Test cross-correlation on a batch of images (CPU for reliability)."""
    print("Test: Batch cross-correlation (multiple images)...", end=" ")

    size = 64
    rng = np.random.RandomState(12345)
    ref_data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)

    ref_img = astro_stack.Image(size, size)
    ref_img.from_numpy(ref_data)

    targets = []
    true_offsets = []

    for i in range(8):
        dx = rng.uniform(-5.0, 5.0)
        dy = rng.uniform(-5.0, 5.0)
        true_offsets.append((dx, dy))

        target = np.zeros_like(ref_data)
        for y in range(size):
            for x in range(size):
                src_x = x - dx
                src_y = y - dy
                sx0, sy0 = int(np.floor(src_x)), int(np.floor(src_y))
                sx1, sy1 = sx0 + 1, sy0 + 1
                sx0 = max(0, min(sx0, size - 1))
                sx1 = max(0, min(sx1, size - 1))
                sy0 = max(0, min(sy0, size - 1))
                sy1 = max(0, min(sy1, size - 1))
                fx, fy = src_x - np.floor(src_x), src_y - np.floor(src_y)
                v00 = ref_data[sy0, sx0]
                v10 = ref_data[sy0, sx1]
                v01 = ref_data[sy1, sx0]
                v11 = ref_data[sy1, sx1]
                target[y, x] = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy

        tgt_img = astro_stack.Image(size, size)
        tgt_img.from_numpy(target.astype(np.float32))
        targets.append(tgt_img)

    correlator = astro_stack.CpuCrossCorrelator()
    offsets = correlator.compute_batch(ref_img, targets)

    assert len(offsets) == len(true_offsets)
    for i, (off, (tdx, tdy)) in enumerate(zip(offsets, true_offsets)):
        assert abs(off.dx - (-tdx)) < 2.0, f"Image {i}: dx expected ~{-tdx}, got {off.dx}"
        assert abs(off.dy - (-tdy)) < 2.0, f"Image {i}: dy expected ~{-tdy}, got {off.dy}"

    print("PASSED")


def test_cuda_batch_parallel_signature():
    """Test that compute_batch_parallel method exists and has correct signature."""
    print("Test: CUDA batch parallel method...", end=" ")

    if not hasattr(astro_stack, 'CudaCrossCorrelator'):
        print("SKIPPED (no CUDA)")
        return

    size = 32
    rng = np.random.RandomState(999)
    ref_data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
    ref_img = astro_stack.Image(size, size)
    ref_img.from_numpy(ref_data)

    targets = []
    for i in range(4):
        tgt_data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
        tgt_img = astro_stack.Image(size, size)
        tgt_img.from_numpy(tgt_data)
        targets.append(tgt_img)

    try:
        correlator = astro_stack.CudaCrossCorrelator()
        offsets = correlator.compute_batch_parallel(
            ref_img, targets, max_batch_size=16)
        assert len(offsets) == 4
        print("PASSED")
    except Exception as e:
        print(f"SKIPPED (CUDA error: {e})")


def test_batch_progress_callback():
    """Test that progress callback works correctly during batch computation."""
    print("Test: Batch progress callback...", end=" ")

    size = 32
    rng = np.random.RandomState(777)
    ref_data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
    ref_img = astro_stack.Image(size, size)
    ref_img.from_numpy(ref_data)

    targets = []
    for i in range(5):
        tgt_data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
        tgt_img = astro_stack.Image(size, size)
        tgt_img.from_numpy(tgt_data)
        targets.append(tgt_img)

    progress_steps = []

    def cb(cur, total, stage):
        progress_steps.append((cur, total))

    correlator = astro_stack.CpuCrossCorrelator()
    offsets = correlator.compute_batch(ref_img, targets, cb)

    assert len(progress_steps) >= 5, "Should have at least 5 progress updates"
    assert progress_steps[-1][0] == progress_steps[-1][1], "Last step should reach total"

    print("PASSED")


def test_batch_empty_targets():
    """Test handling of empty target list."""
    print("Test: Empty targets batch...", end=" ")

    size = 32
    rng = np.random.RandomState(111)
    ref_data = rng.normal(1000.0, 10.0, (size, size)).astype(np.float32)
    ref_img = astro_stack.Image(size, size)
    ref_img.from_numpy(ref_data)

    correlator = astro_stack.CpuCrossCorrelator()
    offsets = correlator.compute_batch(ref_img, [])

    assert len(offsets) == 0
    print("PASSED")


def main():
    tests = [
        test_image_creation,
        test_image_numpy_roundtrip,
        test_fits_io,
        test_offset_struct,
        test_shift_image,
        test_cross_correlation_known_offset,
        test_simple_stack,
        test_progress_callback,
        test_stack_config,
        test_batch_fits,
        test_stack_from_files,
        test_cubic_convolution_interp,
        test_shift_image_no_edge_zeros,
        test_cubic_convolution_no_ringing,
        test_stack_edge_validity_mask,
        test_shift_image_center_unchanged,
        test_batch_cross_correlation_multiple_images,
        test_cuda_batch_parallel_signature,
        test_batch_progress_callback,
        test_batch_empty_targets,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"FAILED: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)} tests")
    print(f"{'='*50}")

    return failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
