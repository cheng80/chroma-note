import sys
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import evaluate_similarity


class SimilarityHelperTests(unittest.TestCase):
    def test_same_image_has_one_for_hsv_and_lbp(self):
        image = Image.new("RGB", (37, 61), (180, 92, 44))
        image = evaluate_similarity.padded_rgb(image)
        hsv = evaluate_similarity.hsv_similarity(image, image)
        self.assertEqual(hsv["target_similarity"], 1.0)
        self.assertEqual(evaluate_similarity.lbp_similarity(image, image), 1.0)

    def test_grayscale_empty_histogram_is_finite_and_defined(self):
        gray = Image.new("RGB", (32, 32), (180, 180, 180))
        paper = Image.new("RGB", (32, 32), (238, 238, 234))
        same = evaluate_similarity.hsv_similarity(gray, gray)
        mixed = evaluate_similarity.hsv_similarity(gray, Image.new("RGB", (32, 32), (180, 92, 44)))
        self.assertTrue(same["left"]["histogram_empty"])
        self.assertEqual(same["target_similarity"], 1.0)
        self.assertEqual(mixed["target_similarity"], 0.0)
        self.assertEqual(evaluate_similarity.hsv_descriptor(paper)[1]["paper_fraction"], 1.0)


if __name__ == "__main__":
    unittest.main()
