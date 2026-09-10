import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from smolvlm2_ontology_adapter import adapt_description, validate_photo_analysis


class AdapterCheck(unittest.TestCase):
    def test_fixed_ontology_dedup_banned_terms_and_schema_limits(self):
        value = adapt_description(
            "A warm coffee cup and mug by a window in Italy; a woman is drinking. "
            "The cozy cozy scene has a table and coffee."
        )
        validate_photo_analysis(value)
        self.assertEqual(value["semantic_tags"], ["커피", "컵", "테이블", "창문", "사람"])
        self.assertEqual(len(value["semantic_tags"]), len(set(value["semantic_tags"])))
        self.assertEqual(set(value), {"scene", "semantic_tags", "mood", "ai_field_note"})
        self.assertNotIn("Italy", str(value))
        self.assertNotIn("drinking", str(value))
        self.assertLessEqual(len(value["semantic_tags"]), 8)
        self.assertLessEqual(len(value["mood"]), 3)
        self.assertEqual(
            adapt_description("Italy Paris waiter employee drinking running"),
            {"scene": None, "semantic_tags": [], "mood": [], "ai_field_note": ""},
        )


if __name__ == "__main__":
    unittest.main()
