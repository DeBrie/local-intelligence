package com.localintelligence.sentiment

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class LocalIntelligenceSentimentPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == LocalIntelligenceSentimentModule.NAME) {
            LocalIntelligenceSentimentModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                LocalIntelligenceSentimentModule.NAME to ReactModuleInfo(
                    LocalIntelligenceSentimentModule.NAME,
                    LocalIntelligenceSentimentModule.NAME,
                    false,
                    false,
                    true,
                    false,
                    false
                )
            )
        }
    }
}
