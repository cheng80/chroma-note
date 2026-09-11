#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ChromaAnalysisBridge : NSObject
- (instancetype)initWithModelPath:(NSString *)modelPath visionPath:(NSString *)visionPath;
- (nullable NSNumber *)prepareWithError:(NSError **)error;
- (nullable NSString *)generateForImagePath:(NSString *)imagePath
                                     prompt:(NSString *)prompt
                                  maxTokens:(NSInteger)maxTokens
                                isCancelled:(BOOL (^)(void))isCancelled
                                      error:(NSError **)error;
@end

NS_ASSUME_NONNULL_END
