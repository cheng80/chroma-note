import unittest
from run_turbo import CASES, validate_cases

class TurboInputTest(unittest.TestCase):
    def test_no_empty_denoising_schedule(self):
        validate_cases(CASES)
        for case in [(1,.5,17),(0,1,17),(2,1.1,17),(2,float('nan'),17)]:
            with self.assertRaises(ValueError): validate_cases([case])

if __name__=='__main__': unittest.main()
