from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from faster_whisper import WhisperModel
from cli_transcribe import transcribe_wav_file, register_new_test_case

print("Loading Faster-Whisper small.en model into memory...")
GLOBAL_MODEL = WhisperModel("small.en", device="cpu", compute_type="int8")
print("Faster-Whisper small.en ready on http://127.0.0.1:8765")

class ASRHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        data = json.loads(body)

        if self.path == "/transcribe":
            wav_path = data.get("wav_path", "")
            browser_hint = data.get("browser_hint", "")
            if not wav_path or not os.path.exists(wav_path):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing wav_path"}).encode("utf-8"))
                return
            result = transcribe_wav_file(wav_path, model=GLOBAL_MODEL, browser_hint=browser_hint)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))
            return

        if self.path == "/learn":
            wav_path = data.get("wav_path", "")
            target = data.get("target", "")
            browser_hint = data.get("browser_hint", "")
            result = register_new_test_case(wav_path, target, browser_hint=browser_hint, model=GLOBAL_MODEL)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8765), ASRHandler)
    server.serve_forever()
