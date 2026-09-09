import unittest
from run_stamp import canonical_prompt, dimensions

class StampConfigTests(unittest.TestCase):
    def test_stable_json_and_image_dimensions(self):
        self.assertEqual(canonical_prompt({'prompt':{'task':'stamp','color':True}}),
                         canonical_prompt({'prompt':{'color':True,'task':'stamp'}}))
        self.assertEqual(dimensions((518,640),512),(416,512))
        self.assertEqual(dimensions((518,640),384),(304,384))
        with self.assertRaises(ValueError): dimensions((0,640),512)
        with self.assertRaises(ValueError): canonical_prompt({'prompt':{}})
        with self.assertRaises(ValueError): canonical_prompt({'prompt':{'task':'stamp','value':float('nan')}})

if __name__ == '__main__': unittest.main()
