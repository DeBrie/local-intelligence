package com.localintelligence.pii

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class LocalIntelligencePIIPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == LocalIntelligencePIIModule.NAME) {
            LocalIntelligencePIIModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                LocalIntelligencePIIModule.NAME to ReactModuleInfo(
                    LocalIntelligencePIIModule.NAME,
                    LocalIntelligencePIIModule.NAME,
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
