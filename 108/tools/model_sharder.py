#!/usr/bin/env python3
"""
ONNX Model Sharding Tool

Splits a large ONNX model (>5GB) into per-layer shards for dynamic loading.
Each shard is a standalone ONNX model containing a contiguous group of layers.

Usage:
    python model_sharder.py --model model.onnx --output shards/ \\
        --layers_per_shard 10 --min_shard_mb 128
"""

import argparse
import os
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper


def estimate_node_weight(node):
    """Estimate the memory weight of a node based on its initializers."""
    total = 0
    for attr in node.attribute:
        if attr.name == "value" and attr.HasField("t"):
            tensor = attr.t
            total += tensor.ByteSize()
    return total


def group_nodes_by_layers(graph, layers_per_shard):
    """Group graph nodes into shards based on layer groups."""
    nodes = list(graph.node)
    total_nodes = len(nodes)

    initializer_map = {}
    for init in graph.initializer:
        initializer_map[init.name] = init

    groups = []
    current_group = []
    current_weight = 0

    for node in nodes:
        node_weight = estimate_node_weight(node)
        for inp in node.input:
            if inp in initializer_map:
                node_weight += initializer_map[inp].ByteSize()

        current_group.append(node)
        current_weight += node_weight

        if len(current_group) >= layers_per_shard:
            groups.append(current_group)
            current_group = []
            current_weight = 0

    if current_group:
        if groups and len(current_group) < layers_per_shard // 2:
            groups[-1].extend(current_group)
        else:
            groups.append(current_group)

    return groups


def create_shard_model(graph, node_group, shard_id, input_names, output_names):
    """Create a standalone ONNX model for a group of nodes."""
    initializer_map = {}
    for init in graph.initializer:
        initializer_map[init.name] = init

    value_info_map = {}
    for vi in graph.value_info:
        value_info_map[vi.name] = vi

    shard_initializers = []
    shard_inputs = []
    shard_outputs = []
    shard_nodes = []

    all_node_inputs = set()
    all_node_outputs = set()

    for node in node_group:
        shard_nodes.append(node)
        for inp in node.input:
            all_node_inputs.add(inp)
        for out in node.output:
            all_node_outputs.add(out)

    internal_tensors = all_node_inputs & all_node_outputs

    for node in node_group:
        for inp in node.input:
            if inp in initializer_map:
                if inp not in [i.name for i in shard_initializers]:
                    shard_initializers.append(initializer_map[inp])

    for name in input_names:
        if name in all_node_inputs or name in internal_tensors:
            vi = value_info_map.get(name)
            if vi:
                shard_inputs.append(vi)
            else:
                inp = helper.make_tensor_value_info(name, onnx.TensorProto.FLOAT,
                                                     [1])
                shard_inputs.append(inp)

    for name in output_names:
        if name in all_node_outputs:
            vi = value_info_map.get(name)
            if vi:
                shard_outputs.append(vi)
            else:
                out = helper.make_tensor_value_info(name, onnx.TensorProto.FLOAT,
                                                     [1])
                shard_outputs.append(out)

    if not shard_inputs:
        first_input = node_group[0].input[0]
        if first_input not in initializer_map:
            vi = helper.make_tensor_value_info(first_input,
                                               onnx.TensorProto.FLOAT, [1])
            shard_inputs.append(vi)

    if not shard_outputs:
        last_output = node_group[-1].output[0]
        vi = helper.make_tensor_value_info(last_output,
                                           onnx.TensorProto.FLOAT, [1])
        shard_outputs.append(vi)

    graph_def = helper.make_graph(
        shard_nodes,
        f"shard_{shard_id}",
        shard_inputs,
        shard_outputs,
        shard_initializers,
    )

    opset_imports = [helper.make_opsetid("", 13)]

    model_def = helper.make_model(graph_def, producer_name="model_sharder",
                                   opset_imports=opset_imports)
    model_def.ir_version = graph.ir_version if hasattr(graph, 'ir_version') else 7

    return model_def


def get_shard_input_output_names(graph, node_group):
    """Determine the input and output names for a shard."""
    all_inputs = set()
    all_outputs = set()

    for node in node_group:
        for inp in node.input:
            all_inputs.add(inp)
        for out in node.output:
            all_outputs.add(out)

    internal = all_inputs & all_outputs

    external_inputs = []
    for node in node_group:
        for inp in node.input:
            if inp not in internal and inp not in external_inputs:
                if inp not in [init.name for init in graph.initializer]:
                    external_inputs.append(inp)

    external_outputs = []
    for node in node_group:
        for out in node.output:
            if out not in internal and out not in external_outputs:
                external_outputs.append(out)

    return external_inputs, external_outputs


def shard_model(model_path, output_dir, layers_per_shard, min_shard_bytes):
    """Main sharding function."""
    print(f"Loading model from {model_path}...")
    model = onnx.load(model_path, load_external_data=False)
    graph = model.graph

    total_weights = sum(init.ByteSize() for init in graph.initializer)
    print(f"Model total weight size: {total_weights / (1024**3):.2f} GB")

    if total_weights < 5 * (1024**3):
        print("Warning: Model is less than 5GB, sharding may not be needed.")
        print("Continuing anyway...")

    os.makedirs(output_dir, exist_ok=True)

    groups = group_nodes_by_layers(graph, layers_per_shard)
    print(f"Grouped {len(graph.node)} nodes into {len(groups)} shards")

    manifest_entries = []
    total_shard_weight = 0

    for i, group in enumerate(groups):
        input_names, output_names = get_shard_input_output_names(graph, group)

        shard_model = create_shard_model(
            graph, group, i, input_names, output_names)

        shard_filename = f"shard_{i:04d}.onnx"
        shard_path = os.path.join(output_dir, shard_filename)

        onnx.save(shard_model, shard_path)

        shard_size = os.path.getsize(shard_path)
        total_shard_weight += shard_size

        input_name = input_names[0] if input_names else ""
        output_name = output_names[0] if output_names else ""

        manifest_entries.append({
            'shard_id': i,
            'filename': shard_filename,
            'weight_bytes': shard_size,
            'num_layers': len(group),
            'input_name': input_name,
            'output_name': output_name,
        })

        print(f"  Shard {i}: {shard_filename} "
              f"({shard_size / (1024**2):.1f} MB, "
              f"{len(group)} nodes, "
              f"input={input_name}, output={output_name})")

    manifest_path = os.path.join(output_dir, "shard_manifest.csv")
    with open(manifest_path, 'w') as f:
        f.write("# shard_id,filename,weight_bytes,num_layers,input_name,output_name\n")
        for entry in manifest_entries:
            f.write(f"{entry['shard_id']},{entry['filename']},"
                    f"{entry['weight_bytes']},{entry['num_layers']},"
                    f"{entry['input_name']},{entry['output_name']}\n")

    print(f"\nManifest written to {manifest_path}")
    print(f"Total shard size: {total_shard_weight / (1024**3):.2f} GB")
    print(f"Shards saved to {output_dir}/")

    return manifest_path


def main():
    parser = argparse.ArgumentParser(
        description="Split large ONNX model into layer-based shards")
    parser.add_argument("--model", required=True,
                        help="Path to the ONNX model file")
    parser.add_argument("--output", required=True,
                        help="Output directory for shards")
    parser.add_argument("--layers_per_shard", type=int, default=10,
                        help="Number of layers per shard (default: 10)")
    parser.add_argument("--min_shard_mb", type=int, default=128,
                        help="Minimum shard size in MB (default: 128)")

    args = parser.parse_args()

    if not os.path.exists(args.model):
        print(f"Error: Model file not found: {args.model}")
        sys.exit(1)

    min_shard_bytes = args.min_shard_mb * 1024 * 1024
    manifest = shard_model(
        args.model, args.output, args.layers_per_shard, min_shard_bytes)

    print(f"\nDone! Use manifest: {manifest}")


if __name__ == "__main__":
    main()
