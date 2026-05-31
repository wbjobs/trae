# -*- coding: utf-8 -*-
"""
BERT 动态批处理调度器 - 测试客户端
用于验证:
  - 动态批处理
  - VIP 优先级插队
  - 变长输入处理
"""

import sys
import time
import argparse
import numpy as np
from typing import List, Dict

try:
    import tritonclient.http as httpclient
    from tritonclient.utils import triton_to_np_dtype
except ImportError:
    print("请安装 tritonclient: pip install tritonclient[http]")
    sys.exit(1)

try:
    from transformers import BertTokenizer
except ImportError:
    print("请安装 transformers: pip install transformers")
    sys.exit(1)


def create_client(url: str = "localhost:8000", verbose: bool = False):
    """创建 Triton HTTP 客户端"""
    try:
        client = httpclient.InferenceServerClient(url=url, verbose=verbose)
        if not client.is_server_live():
            raise RuntimeError("Triton 服务器未启动")
        if not client.is_server_ready():
            raise RuntimeError("Triton 服务器未就绪")
        return client
    except Exception as e:
        print(f"连接 Triton 服务器失败: {e}")
        raise


def check_model_ready(client, model_name: str = "bert_dynamic_batch"):
    """检查模型是否就绪"""
    if not client.is_model_ready(model_name):
        raise RuntimeError(f"模型 {model_name} 未就绪")
    print(f"模型 {model_name} 已就绪")


def encode_texts(tokenizer, texts: List[str], max_length: int = 128):
    """编码文本为 BERT 输入"""
    encoded = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=max_length,
        return_tensors="np"
    )
    return encoded


def infer_batch(
    client,
    input_ids: np.ndarray,
    attention_mask: np.ndarray,
    token_type_ids: np.ndarray,
    priority: int = 2,
    model_name: str = "bert_dynamic_batch",
):
    """发送推理请求"""
    inputs = [
        httpclient.InferInput("input_ids", input_ids.shape, "INT64"),
        httpclient.InferInput("attention_mask", attention_mask.shape, "INT64"),
        httpclient.InferInput("token_type_ids", token_type_ids.shape, "INT64"),
        httpclient.InferInput("priority", (1,), "INT64"),
    ]
    
    inputs[0].set_data_from_numpy(input_ids.astype(np.int64))
    inputs[1].set_data_from_numpy(attention_mask.astype(np.int64))
    inputs[2].set_data_from_numpy(token_type_ids.astype(np.int64))
    inputs[3].set_data_from_numpy(np.array([priority], dtype=np.int64))
    
    outputs = [
        httpclient.InferRequestedOutput("last_hidden_state"),
        httpclient.InferRequestedOutput("pooler_output"),
    ]
    
    start_time = time.time()
    response = client.infer(
        model_name=model_name,
        inputs=inputs,
        outputs=outputs,
    )
    elapsed = time.time() - start_time
    
    return response, elapsed


def test_single_request(client, tokenizer, text: str, priority: int = 2):
    """测试单个请求"""
    encoded = encode_texts(tokenizer, [text])
    
    print(f"\n{'='*60}")
    print(f"请求类型: {'VIP' if priority == 1 else '普通'}")
    print(f"文本长度: {len(text)} 字符")
    print(f"输入形状: {encoded['input_ids'].shape}")
    
    try:
        response, elapsed = infer_batch(
            client,
            encoded["input_ids"],
            encoded["attention_mask"],
            encoded["token_type_ids"],
            priority=priority,
        )
        print(f"推理耗时: {elapsed*1000:.2f}ms")
        print(f"last_hidden_state 形状: {response.as_numpy('last_hidden_state').shape}")
        print(f"pooler_output 形状: {response.as_numpy('pooler_output').shape}")
        return True
    except Exception as e:
        print(f"请求失败: {e}")
        return False


def test_vip_priority(client, tokenizer):
    """测试 VIP 优先级插队"""
    normal_text = "这是普通用户的请求 " * 5
    vip_text = "这是VIP用户的请求，需要优先处理"
    
    normal_encoded = encode_texts(tokenizer, [normal_text])
    vip_encoded = encode_texts(tokenizer, [vip_text])
    
    print(f"\n{'='*60}")
    print("测试 VIP 优先级插队")
    print(f"普通请求输入形状: {normal_encoded['input_ids'].shape}")
    print(f"VIP 请求输入形状: {vip_encoded['input_ids'].shape}")
    
    import concurrent.futures
    
    def send_normal():
        try:
            _, elapsed = infer_batch(
                client,
                normal_encoded["input_ids"],
                normal_encoded["attention_mask"],
                normal_encoded["token_type_ids"],
                priority=2,
            )
            return ('normal', elapsed)
        except Exception as e:
            return ('normal', None, str(e))
    
    def send_vip():
        try:
            _, elapsed = infer_batch(
                client,
                vip_encoded["input_ids"],
                vip_encoded["attention_mask"],
                vip_encoded["token_type_ids"],
                priority=1,
            )
            return ('vip', elapsed)
        except Exception as e:
            return ('vip', None, str(e))
    
    print("\n同时发送普通请求和 VIP 请求...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(send_normal),
            executor.submit(send_vip),
        ]
        results = [f.result() for f in futures]
    
    for name, elapsed, *error in results:
        if error:
            print(f"  {name}: 失败 - {error[0]}")
        else:
            print(f"  {name}: 耗时 {elapsed*1000:.2f}ms")


def test_variable_length(client, tokenizer):
    """测试变长输入"""
    texts = [
        "短文本",
        "这是一段中等长度的文本，用来测试变长输入的处理能力。",
        "长文本 " * 20,
    ]
    
    print(f"\n{'='*60}")
    print("测试变长输入")
    
    for i, text in enumerate(texts):
        print(f"\n请求 {i+1}: 文本长度={len(text)} 字符")
        test_single_request(client, tokenizer, text, priority=2)


def test_concurrent_batching(client, tokenizer):
    """测试并发批处理"""
    texts = [f"并发测试文本 {i} " * 3 for i in range(10)]
    encoded = encode_texts(tokenizer, texts)
    
    print(f"\n{'='*60}")
    print(f"测试并发批处理 - 共 {len(texts)} 个请求")
    print(f"输入形状: {encoded['input_ids'].shape}")
    
    import concurrent.futures
    
    def send_request(idx):
        try:
            single_input_ids = encoded["input_ids"][idx:idx+1]
            single_attention_mask = encoded["attention_mask"][idx:idx+1]
            single_token_type_ids = encoded["token_type_ids"][idx:idx+1]
            _, elapsed = infer_batch(
                client,
                single_input_ids,
                single_attention_mask,
                single_token_type_ids,
                priority=2,
            )
            return (idx, elapsed)
        except Exception as e:
            return (idx, None, str(e))
    
    start_time = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(send_request, i) for i in range(len(texts))]
        results = [f.result() for f in futures]
    total_time = time.time() - start_time
    
    success_count = 0
    for result in results:
        if len(result) == 2:
            idx, elapsed = result
            success_count += 1
            print(f"  请求 {idx+1}: 耗时 {elapsed*1000:.2f}ms")
        else:
            idx, _, error = result
            print(f"  请求 {idx+1}: 失败 - {error}")
    
    print(f"\n总耗时: {total_time*1000:.2f}ms")
    print(f"成功: {success_count}/{len(texts)}")


def get_model_metrics(client, model_name: str = "bert_dynamic_batch"):
    """获取模型统计信息"""
    try:
        stats = client.get_inference_stat(model_name=model_name)
        print(f"\n{'='*60}")
        print("模型统计信息:")
        for stat in stats.model_stats:
            print(f"  模型: {stat.name}")
            print(f"  推理次数: {stat.inference_count}")
            print(f"  执行次数: {stat.execution_count}")
            if hasattr(stat, 'inference_stats'):
                s = stat.inference_stats
                print(f"  队列时间 (ns): count={s.queue.count}, total={s.queue.ns}")
                print(f"  推理时间 (ns): count={s.infer.count}, total={s.infer.ns}")
    except Exception as e:
        print(f"获取统计信息失败: {e}")


def main():
    parser = argparse.ArgumentParser(description="BERT 动态批处理调度器测试客户端")
    parser.add_argument("--url", default="localhost:8000", help="Triton 服务器地址")
    parser.add_argument("--model", default="bert_dynamic_batch", help="模型名称")
    parser.add_argument("--test", choices=["all", "single", "vip", "variable", "concurrent", "stats"],
                        default="all", help="测试类型")
    parser.add_argument("--verbose", action="store_true", help="详细输出")
    args = parser.parse_args()
    
    print("BERT 动态批处理调度器测试客户端")
    print(f"Triton 服务器: {args.url}")
    print(f"模型名称: {args.model}")
    
    tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
    client = create_client(args.url, args.verbose)
    check_model_ready(client, args.model)
    
    if args.test in ("all", "single"):
        test_single_request(client, tokenizer, "Hello world, this is a test.", priority=2)
        test_single_request(client, tokenizer, "VIP 测试", priority=1)
    
    if args.test in ("all", "vip"):
        test_vip_priority(client, tokenizer)
    
    if args.test in ("all", "variable"):
        test_variable_length(client, tokenizer)
    
    if args.test in ("all", "concurrent"):
        test_concurrent_batching(client, tokenizer)
    
    if args.test in ("all", "stats"):
        get_model_metrics(client, args.model)
    
    print(f"\n{'='*60}")
    print("测试完成")


if __name__ == "__main__":
    main()
