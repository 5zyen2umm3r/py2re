import json

def compact_json_at_depth(obj, flatten_depth: int, indent: int = 2) -> str:
    """
    flatten_depth 以降の階層はフラット（1行）で出力する。
    """
    def _encode(o, level: int) -> str:
        pad = " " * indent * level
        inner_pad = " " * indent * (level + 1)

        if level >= flatten_depth:
            # この深さ以降は json.dumps でフラット出力
            return json.dumps(o, ensure_ascii=False)

        if isinstance(o, dict):
            if not o:
                return "{}"
            items = ",\n".join(
                f"{inner_pad}{json.dumps(k)}: {_encode(v, level + 1)}"
                for k, v in o.items()
            )
            return "{\n" + items + "\n" + pad + "}"

        elif isinstance(o, list):
            if not o:
                return "[]"
            items = ",\n".join(
                f"{inner_pad}{_encode(i, level + 1)}" for i in o
            )
            return "[\n" + items + "\n" + pad + "]"

        else:
            return json.dumps(o, ensure_ascii=False)

    return _encode(obj, 0)


if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else "config.json"
    depth = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    result = compact_json_at_depth(data, flatten_depth=depth)

    with open(path, "w", encoding="utf-8") as f:
        f.write(result + "\n")

    print(f"Formatted {path} (flatten_depth={depth})")