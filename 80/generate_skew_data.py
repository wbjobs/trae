import os


def generate_skew_data(output_dir, num_files=5, skew_key="hello", skew_count=500, normal_keys=20):
    os.makedirs(output_dir, exist_ok=True)

    for i in range(num_files):
        filepath = os.path.join(output_dir, f"file{i}.txt")
        with open(filepath, "w", encoding="utf-8") as f:
            skew_per_file = skew_count // num_files
            for _ in range(skew_per_file):
                f.write(f"{skew_key} ")

            for j in range(normal_keys):
                f.write(f"word_{j} ")
            f.write("\n")

            for j in range(normal_keys // 2):
                f.write(f"other_{j} ")
            f.write("\n")

    print(f"Generated {num_files} files in {output_dir}")
    print(f"  Skew key '{skew_key}': ~{skew_count} occurrences")
    print(f"  Normal keys: {normal_keys} unique words")


if __name__ == "__main__":
    output_dir = os.path.join(os.path.dirname(__file__), "examples", "wordcount_skew", "input")
    generate_skew_data(output_dir, num_files=5, skew_count=500, normal_keys=20)
