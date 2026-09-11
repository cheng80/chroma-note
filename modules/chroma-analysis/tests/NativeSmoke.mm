#import <Foundation/Foundation.h>
#import "ChromaAnalysisBridge.h"

int main(int argc, const char * argv[]) {
  @autoreleasepool {
    if (argc != 5 && argc != 6) return 64;
    CFAbsoluteTime started = CFAbsoluteTimeGetCurrent();
    double cancelAfter = argc == 6 ? atof(argv[5]) / 1000.0 : 0;
    ChromaAnalysisBridge * engine = [[ChromaAnalysisBridge alloc]
      initWithModelPath:@(argv[1]) visionPath:@(argv[2])];
    NSError * error = nil;
    NSString * output = [engine generateForImagePath:@(argv[3]) prompt:@(argv[4])
      maxTokens:48 isCancelled:^BOOL {
        return cancelAfter > 0 && CFAbsoluteTimeGetCurrent() - started >= cancelAfter;
      } error:&error];
    if (!output) {
      fprintf(stderr, "%s\n", error.localizedDescription.UTF8String);
      return 1;
    }
    printf("%s\n", output.UTF8String);
  }
  return 0;
}
