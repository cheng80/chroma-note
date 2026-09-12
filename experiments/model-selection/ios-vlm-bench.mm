// Experiment only: run the unchanged app bridge inside iOS Simulator.
#import <Foundation/Foundation.h>
#import "ChromaAnalysisBridge.h"
#include <sys/resource.h>
#include <mach/mach.h>
#include <iostream>
#include <string>

int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc != 3) return 2;
    ChromaAnalysisBridge *engine = [[ChromaAnalysisBridge alloc]
      initWithModelPath:@(argv[1]) visionPath:@(argv[2])];
    std::string line;
    while (std::getline(std::cin, line)) {
      @autoreleasepool {
        NSError *error = nil;
        NSData *data = [NSData dataWithBytes:line.data() length:line.size()];
        id decoded = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
        if (![decoded isKindOfClass:NSDictionary.class]) return 3;
        NSDictionary *request = decoded;
        double start = NSProcessInfo.processInfo.systemUptime;
        id value = nil;
        if ([request[@"op"] isEqual:@"prepare"]) {
          value = [engine prepareWithIsCancelled:^{
            return NSProcessInfo.processInfo.systemUptime - start > 180;
          } error:&error];
        } else if ([request[@"op"] isEqual:@"generate"] &&
                   [request[@"image"] isKindOfClass:NSString.class] &&
                   [request[@"prompt"] isKindOfClass:NSString.class] &&
                   [request[@"maxTokens"] isKindOfClass:NSNumber.class] &&
                   [request[@"maxTokens"] integerValue] > 0 &&
                   [request[@"maxTokens"] integerValue] <= 128) {
          value = [engine generateForImagePath:request[@"image"] prompt:request[@"prompt"]
            maxTokens:[request[@"maxTokens"] integerValue] isCancelled:^{
              return NSProcessInfo.processInfo.systemUptime - start > 90;
            } error:&error];
        } else {
          return 4;
        }
        double duration = (NSProcessInfo.processInfo.systemUptime - start) * 1000;
        struct rusage usage = {};
        getrusage(RUSAGE_SELF, &usage);
        task_vm_info_data_t vm = {};
        mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
        bool hasFootprint = task_info(mach_task_self(), TASK_VM_INFO,
          (task_info_t)&vm, &count) == KERN_SUCCESS;
        NSDictionary *result = @{
          @"value": value ?: NSNull.null,
          @"error": error.localizedDescription ?: NSNull.null,
          @"duration_ms": @(duration),
          @"peak_rss_bytes": @(usage.ru_maxrss),
          @"footprint_after_bytes": hasFootprint ? @(vm.phys_footprint) : NSNull.null,
          @"pid": @(NSProcessInfo.processInfo.processIdentifier)
        };
        NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:&error];
        if (!json) return 5;
        std::cout.write((const char *)json.bytes, json.length);
        std::cout << std::endl;
      }
    }
  }
  return 0;
}
