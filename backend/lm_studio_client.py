import requests
import json
import os
from typing import Optional, Dict, Any, Generator
from dotenv import load_dotenv

load_dotenv()

class LmStudioClient:
    def __init__(self, url: str = "http://localhost:1234/v1/chat/completions"):
        self.url = url
        # FIX: Read model name from env var or detect from loaded models endpoint
        self.model_name = os.getenv("LM_STUDIO_MODEL", "local-model")

    def check_health(self) -> bool:
        try:
            # FIX: Extract base URL from self.url instead of hardcoding
            base_url = self.url.rsplit("/", 1)[0]  # "http://localhost:1234" from "http://localhost:1234/v1/..."
            response = requests.get(base_url, timeout=2)
            return response.status_code == 200
        except:
            return False
    
    def detect_model(self) -> str:
        """Try to detect the currently loaded model in LM Studio."""
        try:
            base_url = self.url.rsplit("/", 1)[0]
            response = requests.get(f"{base_url}/models", timeout=2)
            if response.status_code == 200:
                data = response.json()
                # LM Studio returns {"data": [{"id": "model-name"}, ...]}
                models = data.get("data", [])
                if models:
                    return models[0].get("id", self.model_name)
        except:
            pass
        return self.model_name

    def generate_response(
        self, 
        messages: list, 
        stream: bool = False
    ) -> str:
        """
        Sends a request to LM Studio.
        If stream is False, returns the full text.
        """
        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1024,
            "stream": stream
        }

        try:
            if stream:
                return self._stream(payload)
            else:
                response = requests.post(self.url, json=payload, timeout=30)
                response.raise_for_status()
                data = response.json()
                return data['choices'][0]['message']['content']
        except requests.exceptions.ConnectionError:
            return "⚠️ **System Error**: LM Studio is offline or unreachable. Please start LM Studio and load a model."
        except Exception as e:
            return f"⚠️ **AI Error**: {str(e)}"

    def _stream(self, payload: dict) -> Generator[str, None, None]:
        """Generator to yield chunks from the stream."""
        try:
            response = requests.post(self.url, json=payload, stream=True, timeout=60)
            response.raise_for_status()
            
            for line in response.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            token = data['choices'][0]['delta'].get('content', '')
                            if token:
                                yield token
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield f"\n\n⚠️ **Stream Error**: {str(e)}"