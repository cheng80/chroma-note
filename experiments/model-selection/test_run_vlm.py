import json
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parent))
import run_vlm


class ValidateOutputTests(unittest.TestCase):
    def valid(self):
        return {
            "scene": "창가의 실내 장면",
            "semantic_tags": ["창문", "테이블"],
            "mood": ["차분함", "따뜻함"],
            "ai_field_note": "사진에 보이는 내용만 간단히 설명합니다.",
        }

    def test_rejects_extra_key(self):
        value = self.valid()
        value["expected_tag"] = "카페"
        _, errors = run_vlm.validate_output(json.dumps(value, ensure_ascii=False))
        self.assertTrue(any("unexpected key" in error for error in errors))

    def test_rejects_nonfinite_json(self):
        raw = '{"scene":NaN,"semantic_tags":[],"mood":[],"ai_field_note":""}'
        _, errors = run_vlm.validate_output(raw)
        self.assertTrue(any("invalid JSON" in error for error in errors))

    def test_rejects_empty_and_nonstring_items(self):
        value = self.valid()
        value["semantic_tags"] = ["", 3]
        _, errors = run_vlm.validate_output(json.dumps(value, ensure_ascii=False))
        self.assertTrue(any("must not be empty" in error for error in errors))
        self.assertTrue(any("must be a string" in error for error in errors))

    def test_rejects_maximum_bound_overflow(self):
        value = self.valid()
        value["scene"] = "가" * 121
        value["semantic_tags"] = ["가" * 25]
        value["mood"] = ["가" * 25, "b", "c", "d"]
        value["ai_field_note"] = "a" * 301
        _, errors = run_vlm.validate_output(json.dumps(value, ensure_ascii=False))
        self.assertTrue(any("scene exceeds" in error for error in errors))
        self.assertTrue(any("semantic_tags[0] exceeds" in error for error in errors))
        self.assertTrue(any("mood exceeds" in error for error in errors))
        self.assertTrue(any("mood[0] exceeds" in error for error in errors))
        self.assertTrue(any("ai_field_note exceeds" in error for error in errors))

    def test_caption_is_only_returned_when_requested(self):
        value = self.valid()
        raw = json.dumps(value, ensure_ascii=False)
        self.assertTrue(run_vlm.validate_output(raw, "analysis")[1])
        value["ai_field_note"] = ""
        self.assertFalse(run_vlm.validate_output(json.dumps(value), "analysis")[1])
        caption = json.dumps({"ai_field_note": "빛이 머문 자리"}, ensure_ascii=False)
        self.assertFalse(run_vlm.validate_output(caption, "caption")[1])
        self.assertTrue(run_vlm.validate_output(raw, "caption")[1])
        self.assertEqual(run_vlm.task_schema("analysis")["properties"]["ai_field_note"]["const"], "")
        self.assertEqual(run_vlm.task_schema("caption")["required"], ["ai_field_note"])


class PromptTests(unittest.TestCase):
    def test_prompt_does_not_include_filename_path_or_search_terms(self):
        prompt = run_vlm.build_prompt("ko")
        self.assertNotIn("/tmp/private-photo.jpg", prompt)
        self.assertNotIn("cozy cafe window", prompt)
        self.assertNotIn("expected_tag", prompt)
        self.assertIn("schema", prompt.lower())
        self.assertIn("빈 문자열", prompt)
        self.assertIn("감성 문구 한 문장", run_vlm.build_prompt("ko", "caption"))


class ProtocolTests(unittest.TestCase):
    def test_chat_uses_fixed_local_inference_contract(self):
        captured = {}

        def fake_request(path, payload, timeout):
            captured.update(path=path, payload=payload, timeout=timeout)
            return {
                "message": {"content": "{}"},
                "total_duration": 123,
                "prompt_eval_count": 7,
                "eval_count": 8,
            }

        with patch.object(run_vlm, "request_json", side_effect=fake_request):
            content, metadata = run_vlm._chat("llava:latest", "prompt", "aW1hZ2U=", 42, 120)

        self.assertEqual(content, "{}")
        self.assertEqual(metadata["total_duration"], 123)
        self.assertEqual(metadata["eval_count"], 8)
        self.assertEqual(captured["path"], "/api/chat")
        self.assertEqual(captured["payload"]["stream"], False)
        self.assertEqual(captured["payload"]["keep_alive"], "5m")
        self.assertEqual(captured["payload"]["format"], run_vlm.task_schema("analysis"))
        self.assertEqual(captured["payload"]["options"], {
            "temperature": 0.2,
            "seed": 42,
            "num_predict": 512,
            "num_ctx": 4096,
        })
        self.assertEqual(captured["payload"]["messages"][0]["images"], ["aW1hZ2U="])

    def test_timeout_stops_without_retry_and_unloads(self):
        with patch.object(run_vlm, "_chat", side_effect=run_vlm.RequestTimeout("request timed out")) as chat, \
             patch.object(run_vlm, "unload_model") as unload:
            result, stopped = run_vlm.run_case("local", "image", "ko", 42, 120)
        self.assertTrue(stopped)
        self.assertEqual(result["status"], "timeout")
        self.assertIsNone(result["retry"])
        chat.assert_called_once()
        unload.assert_called_once_with("local")

    def test_invalid_first_output_gets_one_generic_retry(self):
        valid = json.dumps({
            "scene": None,
            "semantic_tags": [],
            "mood": ["차분함", "고요함"],
            "ai_field_note": "",
        }, ensure_ascii=False)
        prompts = []

        def fake_chat(model, prompt, image, seed, timeout, task):
            prompts.append(prompt)
            raw = '{"unexpected": true}' if len(prompts) == 1 else valid
            return raw, {"eval_count": len(prompts)}

        with patch.object(run_vlm, "_chat", side_effect=fake_chat):
            result, stopped = run_vlm.run_case("llava:latest", "aW1hZ2U=", "ko", 17, 120)

        self.assertFalse(stopped)
        self.assertFalse(result["first_valid"])
        self.assertTrue(result["final_valid"])
        self.assertEqual(len(prompts), 2)
        self.assertIn("Format correction only", prompts[1])
        self.assertNotIn("expected_tag", prompts[1])

    def test_run_groups_all_images_by_model_and_records_input_mapping(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "p001.jpg"
            second = root / "p002.jpg"
            first.write_bytes(b"first-image")
            second.write_bytes(b"second-image")
            output = root / "out"
            order = []

            def fake_case(model, image, locale, seed, timeout, task):
                order.append((model, image))
                return {
                    "status": "ok",
                    "elapsed_seconds": 0,
                    "budget_flag": False,
                    "first": {},
                    "retry": None,
                    "first_valid": True,
                    "final_valid": True,
                    "result": {},
                    "error": None,
                }, False

            def fake_request(path, payload, timeout):
                if path == "/api/tags":
                    return {"models": [
                        {"name": "m1", "digest": "d1"},
                        {"name": "m2", "digest": "d2"},
                    ]}
                return {"capabilities": ["vision"], "license": "local"}

            args = run_vlm.make_parser().parse_args([
                "--model", "m1", "m2",
                "--images", str(first), str(second),
                "--out", str(output),
                "--seeds", "17",
                "--locales", "en",
            ])
            with patch.object(run_vlm, "request_json", side_effect=fake_request), \
                    patch.object(run_vlm, "run_case", side_effect=fake_case), \
                    patch.object(run_vlm, "unload_model") as unload:
                self.assertEqual(run_vlm.run(args), 0)

            self.assertEqual([model for model, _ in order], ["m1", "m1", "m2", "m2"])
            self.assertEqual(unload.call_args_list[0].args, ("m1",))
            self.assertEqual(unload.call_args_list[1].args, ("m2",))
            config = json.loads((output / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(config["images"][0]["id"], "p001")
            self.assertEqual(config["images"][0]["path"], str(first))
            self.assertEqual(
                config["images"][0]["sha256"],
                hashlib.sha256(b"first-image").hexdigest(),
            )


if __name__ == "__main__":
    unittest.main()
