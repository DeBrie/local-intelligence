package com.localintelligence.core

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class LocalIntelligenceCorePackage : TurboReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == LocalIntelligenceCoreModule.NAME) {
            LocalIntelligenceCoreModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                LocalIntelligenceCoreModule.NAME to ReactModuleInfo(
                    LocalIntelligenceCoreModule.NAME,
                    LocalIntelligenceCoreModule.NAME,
                    false,
                    false,
                    true,
                    false,
                    true
                )
            )
        }
    }
}
