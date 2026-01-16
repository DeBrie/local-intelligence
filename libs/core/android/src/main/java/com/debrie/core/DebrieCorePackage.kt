package com.debrie.core

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class DebrieCorePackage : TurboReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == DebrieCoreModule.NAME) {
            DebrieCoreModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                DebrieCoreModule.NAME to ReactModuleInfo(
                    DebrieCoreModule.NAME,
                    DebrieCoreModule.NAME,
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
