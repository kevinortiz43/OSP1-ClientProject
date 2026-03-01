# GPU and Default Model Notes

## Default Models

The application uses 2 default models:

| Model | Purpose | HuggingFace Link |
|-------|---------|------------------|
| **distil-qwen3** | Lightweight fine-tuned text-to-SQL model (local testing only) | [distil-labs/distil-qwen3-4b-text2sql-gguf-4bit](https://huggingface.co/distil-labs/distil-qwen3-4b-text2sql-gguf-4bit) |
| **qwen2.5-coder 7B** | Response generation and evaluation | [Qwen/Qwen2.5-Coder-7B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF) |

**Note**: Qwen2.5-coder was chosen over Qwen3 coder-next because the newer model requires a pre-release version of the Docker Ollama image, while we maintain compatibility with the latest stable Ollama release.

## Model Format

Both models use **GGUF format** for 2 primary reasons:
- **Storage efficiency**: Smaller file footprint
- **CPU compatibility**: Maximum compatibility with CPU-only setups (llama.cpp runs GGUF under the hood)

> **For Nvidia GPU users**: If you have Nvidia GPU capability and want to test models in safetensors format, you'll need a different configuration and may consider [VLLM](https://github.com/vllm-project/vllm) instead of Ollama.

## VRAM Requirements

### Viewing Model Information
Run the following command to see loaded models:

`docker compose exec ollama ollama list`

### Model Sizes (Base)
Example model sizes without Ollama runtime overhead:

| Model | Size | Notes |
|-------|------|-------|
| qwen2.5-coder:14b | 9.0 GB | Larger response + judge model (optional) |
| qwen2.5-coder:7b | 4.7 GB | Default response + judge model |
| distil-qwen3-4b:latest | 2.5 GB | Default text-to-SQL model |
| arctic-text2sql:latest | 4.7 GB | Alternative text-to-SQL model |

### VRAM Estimates with Ollama Overhead
The following estimates include Ollama runtime overhead (~10-20% additional VRAM):

| Model | Estimated VRAM | Role |
|-------|---------------|------|
| distil-qwen3-4b:latest | ~4 GB | Text-to-SQL (default) |
| arctic-text2sql:latest | ~8-9 GB | Text-to-SQL (optional larger) |
| qwen2.5-coder:7b | ~7 GB | Response + Judge (default) |
| qwen2.5-coder:14b | ~14 GB | Response + Judge (optional larger) |

### Default Setup Requirements
The current default configuration preloads both models simultaneously:

- **distil-qwen3**: ~4 GB
- **qwen2.5-coder 7b**: ~7 GB

**Total VRAM required**: ~11 GB

### Model Selection Rationale
The default models were selected based on:

- **Smallest size** for broad compatibility
- **Fastest inference** for demo purposes
- **Comparable performance** to larger models

> **Note**: While these smaller models appear to perform nearly as well as their larger counterparts, comprehensive benchmarking was outside this experiment's scope. Users are encouraged to test and compare models based on their specific requirements.

### Related Documentation
- [Main README](README.md) - Project overview
- [AI Architecture Deep Dive](ai-architecture.md) - Comprehensive setup guide
- [Setup Guide](setup.md) - Model specifications and VRAM requirements