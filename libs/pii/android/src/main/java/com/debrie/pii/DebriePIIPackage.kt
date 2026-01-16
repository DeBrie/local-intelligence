package com.debrie.pii

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class DebriePIIPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == DebriePIIModule.NAME) {
            DebriePIIModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                DebriePIIModule.NAME to ReactModuleInfo(
                    DebriePIIModule.NAME,
                    DebriePIIModule.NAME,
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
