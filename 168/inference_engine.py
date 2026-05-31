import time
import logging
import numpy as np
from typing import List, Tuple

import onnxruntime as ort
from config import ModelConfig

logger = logging.getLogger(__name__)


class InferenceEngine:
    def __init__(self, config: ModelConfig, metrics_collector=None):
        self._config = config
        self._metrics = metrics_collector
        self._session = None
        self._input_name = None
        self._output_name = None
        self._scale = config.scale_factor
        self._batch_size = config.batch_size
        self._init_session()

    def _init_session(self):
        providers = []
        if self._config.device == "cuda":
            cuda_provider_options = {
                "device_id": 0,
                "arena_extend_strategy": "kNextPowerOfTwo",
                "cudnn_conv_algo_search": "EXHAUSTIVE",
                "do_copy_in_default_stream": True,
            }
            if self._config.fp16:
                cuda_provider_options["enable_fp16"] = "1"
            providers.append(("CUDAExecutionProvider", cuda_provider_options))
            logger.info("CUDAExecutionProvider enabled with fp16=%s", self._config.fp16)
        providers.append("CPUExecutionProvider")

        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.execution_mode = ort.ExecutionMode.ORT_PARALLEL
        sess_options.intra_op_num_threads = 4
        sess_options.inter_op_num_threads = 4

        self._session = ort.InferenceSession(
            self._config.model_path,
            sess_options=sess_options,
            providers=providers,
        )

        for provider in self._session.get_providers():
            logger.info("ONNX Runtime provider: %s", provider)

        self._input_name = self._session.get_inputs()[0].name
        self._output_name = self._session.get_outputs()[0].name

        input_shape = self._session.get_inputs()[0].shape
        output_shape = self._session.get_outputs()[0].shape
        logger.info("Model input: %s -> %s", self._input_name, input_shape)
        logger.info("Model output: %s -> %s", self._output_name, output_shape)

    def _preprocess(self, frames: List[np.ndarray]) -> np.ndarray:
        batch = np.stack(frames, axis=0)
        batch = batch.astype(np.float32) / 255.0
        batch = np.transpose(batch, (0, 3, 1, 2))
        return batch

    def _postprocess(self, output: np.ndarray) -> List[np.ndarray]:
        output = np.transpose(output, (0, 2, 3, 1))
        output = np.clip(output, 0.0, 1.0)
        output = (output * 255.0).astype(np.uint8)
        return list(output)

    def infer_batch(self, frames: List[np.ndarray]) -> Tuple[List[np.ndarray], float]:
        if len(frames) == 0:
            return [], 0.0

        if self._metrics:
            self._metrics.set_batch_size(len(frames))

        batch_input = self._preprocess(frames)

        actual_batch_size = batch_input.shape[0]
        if actual_batch_size < self._batch_size:
            padding = np.zeros(
                (self._batch_size - actual_batch_size, *batch_input.shape[1:]),
                dtype=np.float32,
            )
            batch_input = np.concatenate([batch_input, padding], axis=0)

        start_time = time.perf_counter()

        output = self._session.run(
            [self._output_name],
            {self._input_name: batch_input},
        )[0]

        inference_time = time.perf_counter() - start_time

        if self._metrics:
            self._metrics.observe_inference_duration(inference_time)

        output = output[:actual_batch_size]
        output_frames = self._postprocess(output)

        return output_frames, inference_time

    def compute_psnr(self, original: np.ndarray, enhanced: np.ndarray) -> float:
        original = original.astype(np.float64)
        enhanced = enhanced.astype(np.float64)
        mse = np.mean((original - enhanced) ** 2)
        if mse == 0:
            return float("inf")
        max_pixel = 255.0
        psnr = 20 * np.log10(max_pixel / np.sqrt(mse))
        return float(psnr)
