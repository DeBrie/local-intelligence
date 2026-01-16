package com.debrie.sentiment

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class DebrieSentimentPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == DebrieSentimentModule.NAME) {
            DebrieSentimentModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                DebrieSentimentModule.NAME to ReactModuleInfo(
                    DebrieSentimentModule.NAME,
                    DebrieSentimentModule.NAME,
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
