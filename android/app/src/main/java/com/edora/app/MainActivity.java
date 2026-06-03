package com.edora.app;

import com.getcapacitor.BridgeActivity;
import com.edora.app.plugins.SmartReplyPlugin;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmartReplyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
