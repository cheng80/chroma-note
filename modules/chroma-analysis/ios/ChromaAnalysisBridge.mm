#import "ChromaAnalysisBridge.h"

#include "llama.h"
#include "mtmd.h"
#include "mtmd-helper.h"

#include <algorithm>
#include <string>
#include <vector>

namespace {
struct CancelContext { BOOL (^block)(void); };

bool keepLoading(float, void * data) {
  auto * cancel = static_cast<CancelContext *>(data);
  return !cancel->block();
}

bool shouldAbort(void * data) {
  return static_cast<CancelContext *>(data)->block();
}

NSError * failure(NSString * code) {
  return [NSError errorWithDomain:@"ChromaAnalysis" code:1 userInfo:@{NSLocalizedDescriptionKey: code}];
}

void discardLog(ggml_log_level, const char *, void *) {}

std::string piece(const llama_vocab * vocab, llama_token token) {
  std::vector<char> buffer(64);
  int32_t count = llama_token_to_piece(vocab, token, buffer.data(), (int32_t)buffer.size(), 0, false);
  if (count < 0) {
    buffer.resize((size_t)-count);
    count = llama_token_to_piece(vocab, token, buffer.data(), (int32_t)buffer.size(), 0, false);
  }
  return count > 0 ? std::string(buffer.data(), (size_t)count) : std::string();
}
}

@implementation ChromaAnalysisBridge {
  NSString *_modelPath;
  NSString *_visionPath;
  llama_model *_model;
  mtmd_context *_vision;
}

- (instancetype)initWithModelPath:(NSString *)modelPath visionPath:(NSString *)visionPath {
  if ((self = [super init])) {
    _modelPath = [modelPath copy];
    _visionPath = [visionPath copy];
  }
  return self;
}

- (void)dealloc {
  if (_vision) mtmd_free(_vision);
  if (_model) llama_model_free(_model);
}

- (BOOL)loadWithCancellation:(CancelContext *)cancel error:(NSError **)error {
  if (_model && _vision) return YES;
  llama_backend_init();
  llama_log_set(discardLog, nullptr);
  mtmd_helper_log_set(discardLog, nullptr);
  llama_model_params modelParams = llama_model_default_params();
  modelParams.n_gpu_layers = 0;
  modelParams.progress_callback = keepLoading;
  modelParams.progress_callback_user_data = cancel;
  _model = llama_model_load_from_file(_modelPath.fileSystemRepresentation, modelParams);
  if (!_model) {
    if (error) *error = failure(cancel->block() ? @"analysis_cancelled" : @"analysis_model_load_failed");
    return NO;
  }
  mtmd_context_params visionParams = mtmd_context_params_default();
  visionParams.use_gpu = false;
  visionParams.n_threads = (int)std::max(1ul, std::min(8ul, NSProcessInfo.processInfo.processorCount - 1));
  visionParams.warmup = false;
  visionParams.progress_callback = keepLoading;
  visionParams.progress_callback_user_data = cancel;
  _vision = mtmd_init_from_file(_visionPath.fileSystemRepresentation, _model, visionParams);
  if (!_vision || !mtmd_support_vision(_vision)) {
    if (_vision) { mtmd_free(_vision); _vision = nullptr; }
    llama_model_free(_model); _model = nullptr;
    if (error) *error = failure(cancel->block() ? @"analysis_cancelled" : @"analysis_vision_load_failed");
    return NO;
  }
  return YES;
}

- (NSNumber *)prepareWithError:(NSError **)error {
  CancelContext cancel{^{ return NO; }};
  return [self loadWithCancellation:&cancel error:error] ? @YES : nil;
}

- (NSString *)generateForImagePath:(NSString *)imagePath
                            prompt:(NSString *)prompt
                         maxTokens:(NSInteger)maxTokens
                       isCancelled:(BOOL (^)(void))isCancelled
                             error:(NSError **)error {
  CancelContext cancel{[isCancelled copy]};
  if (cancel.block()) { if (error) *error = failure(@"analysis_cancelled"); return nil; }
  if (![self loadWithCancellation:&cancel error:error]) return nil;

  llama_context_params contextParams = llama_context_default_params();
  contextParams.n_ctx = 4096;
  contextParams.n_batch = 2048;
  contextParams.n_ubatch = 512;
  contextParams.n_threads = (int32_t)std::max(1ul, std::min(8ul, NSProcessInfo.processInfo.processorCount - 1));
  contextParams.n_threads_batch = contextParams.n_threads;
  contextParams.offload_kqv = false;
  contextParams.abort_callback = shouldAbort;
  contextParams.abort_callback_data = &cancel;
  llama_context * context = llama_init_from_model(_model, contextParams);
  if (!context) { if (error) *error = failure(@"analysis_context_failed"); return nil; }
  auto freeContext = [&] { llama_free(context); };

  mtmd_helper_init_opt imageOptions = mtmd_helper_init_opt_default();
  mtmd_helper_bitmap_wrapper image = mtmd_helper_bitmap_init_from_file(_vision, imagePath.fileSystemRepresentation, false, imageOptions);
  if (!image.bitmap || image.video_ctx) {
    if (image.bitmap) mtmd_bitmap_free(image.bitmap);
    if (image.video_ctx) mtmd_helper_video_free(image.video_ctx);
    freeContext();
    if (error) *error = failure(@"analysis_invalid_image");
    return nil;
  }

  std::string content = std::string(mtmd_default_marker()) + prompt.UTF8String;
  llama_chat_message message{ "user", content.c_str() };
  const char * chatTemplate = llama_model_chat_template(_model, nullptr);
  int32_t formattedSize = llama_chat_apply_template(chatTemplate, &message, 1, true, nullptr, 0);
  if (formattedSize <= 0) {
    mtmd_bitmap_free(image.bitmap); freeContext();
    if (error) *error = failure(@"analysis_prompt_failed");
    return nil;
  }
  std::vector<char> formatted((size_t)formattedSize + 1);
  llama_chat_apply_template(chatTemplate, &message, 1, true, formatted.data(), (int32_t)formatted.size());
  mtmd_input_text input{formatted.data(), (size_t)formattedSize, true, true};
  const mtmd_bitmap * bitmaps[] = { image.bitmap };
  mtmd_input_chunks * chunks = mtmd_input_chunks_init();
  int32_t status = mtmd_tokenize(_vision, chunks, &input, bitmaps, 1);
  mtmd_bitmap_free(image.bitmap);
  if (status != 0) {
    mtmd_input_chunks_free(chunks); freeContext();
    if (error) *error = failure(@"analysis_tokenize_failed");
    return nil;
  }
  llama_pos nPast = 0;
  status = mtmd_helper_eval_chunks(_vision, context, chunks, 0, 0, 2048, true, &nPast);
  mtmd_input_chunks_free(chunks);
  if (status != 0) {
    freeContext();
    if (error) *error = failure(cancel.block() ? @"analysis_cancelled" : @"analysis_image_eval_failed");
    return nil;
  }

  llama_sampler_chain_params samplerParams = llama_sampler_chain_default_params();
  llama_sampler * sampler = llama_sampler_chain_init(samplerParams);
  llama_sampler_chain_add(sampler, llama_sampler_init_temp(0.2f));
  llama_sampler_chain_add(sampler, llama_sampler_init_dist(17));
  const llama_vocab * vocab = llama_model_get_vocab(_model);
  std::string output;
  for (NSInteger index = 0; index < maxTokens && !cancel.block(); index++) {
    llama_token token = llama_sampler_sample(sampler, context, -1);
    llama_sampler_accept(sampler, token);
    if (llama_vocab_is_eog(vocab, token)) break;
    output += piece(vocab, token);
    llama_batch batch = llama_batch_get_one(&token, 1);
    if (llama_decode(context, batch) != 0) { status = 1; break; }
  }
  llama_sampler_free(sampler);
  freeContext();
  if (cancel.block()) { if (error) *error = failure(@"analysis_cancelled"); return nil; }
  if (status != 0) { if (error) *error = failure(@"analysis_decode_failed"); return nil; }
  return [[NSString alloc] initWithBytes:output.data() length:output.size() encoding:NSUTF8StringEncoding];
}

@end
