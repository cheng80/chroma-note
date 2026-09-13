package com.cheng80.chromaanalysis

import java.io.File

/** Called on the module's serial inference executor; cancellation may run on the JS thread. */
internal class AnalysisEngine : AutoCloseable {
  private var handle = nativeCreate()

  fun beginJob() = nativeResetCancellation(handle)
  fun cancel() = nativeCancel(handle)
  fun prepare(model: File, vision: File) = nativePrepare(handle, model.path, vision.path)
  fun generate(image: File, prompt: String, maxTokens: Int): String =
    nativeGenerate(handle, image.path, prompt.toByteArray(Charsets.UTF_8), maxTokens).toString(Charsets.UTF_8)

  override fun close() {
    if (handle != 0L) { nativeDestroy(handle); handle = 0L }
  }

  private external fun nativeCreate(): Long
  private external fun nativeResetCancellation(handle: Long)
  private external fun nativeCancel(handle: Long)
  private external fun nativePrepare(handle: Long, model: String, vision: String)
  private external fun nativeGenerate(handle: Long, image: String, prompt: ByteArray, maxTokens: Int): ByteArray
  private external fun nativeDestroy(handle: Long)

  companion object { init { System.loadLibrary("chroma-analysis") } }
}
