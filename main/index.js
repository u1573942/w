const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs').promises;

const app = express();
app.use(cors());
app.use(express.json());

async function loadProxies() {
    const data = await fs.readFile('proxies.txt', 'utf8');
    return data.split('\n').map(line => line.trim());
}

async function isProxyWorking(proxy) {
    const testUrl = "http://www.httpbin.org/ip";
    try {
        const [proxyHost, proxyPort] = proxy.split(':');
        const response = await axios.get(testUrl, {
            proxy: {
                protocol: 'http',
                host: proxyHost,
                port: parseInt(proxyPort),
            },
            timeout: 1000
        });
        return response.status === 200;
    } catch (err) {
        return false;
    }
}

async function selectValidProxy() {
    console.log('selection');
    const proxies = await loadProxies();
    const shuffledProxies = proxies.sort(() => Math.random() - 0.5);

    for (const proxy of shuffledProxies) {
        if (await isProxyWorking(proxy)) {
            return proxy;
        }
    }
    return null;
}

app.post('/predict', async (req, res) => {
    try {
        const negativePrompt = req.body.negative_prompt || '';
        const prompt = req.body.prompt || '';
        const steps = req.body.steps || 50;
        const gd = req.body.gd;
        const origin = req.headers.origin;
        const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log("Received request from:", origin, ipAddress);

        const prox = await selectValidProxy();
        if (!prox) {
            console.log("No valid proxy found.");
            return res.json({ error: 'No valid proxy found.' });
        }

        console.log("Selected proxy:", prox);
        const url2 = "https://replicate.com/api/predictions";
        const headers2 = {
            "Origin": "https://replicate.com",
            "Content-Type": "application/json", 
            "Connection" : "keep-alive" 
        };

        const payload2 = {
            "input": {
                "width": 1024,
                "height": 1024,
                "prompt": prompt,
                "refine": "expert_ensemble_refiner",
                "scheduler": "K_EULER",
                "lora_scale": 0.6,
                "num_outputs": 1,
                "guidance_scale": gd,
                "apply_watermark": false,
                "high_noise_frac": 1,
                "negative_prompt": negativePrompt,
                "prompt_strength": 0.8,
                "num_inference_steps": steps
            },
            "is_training": false,
            "create_model": "0",
            "stream": false,
            "version": "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"
        };

const proxies_ = {
    protocol: 'http',
    host: prox.split(':')[0],
    port: parseInt(prox.split(':')[1]),
};
        const response2 = await axios.post(url2, payload2, { 
    headers: headers2, 
    proxy: proxies_, 
    timeout: 60000,
    validateStatus: function (status) {
      return status >= 200 && status < 500; // Resolve only if the status code is less than 500
    },
    secureProtocol: 'TLSv1_2'
}); 
        const response2Json = response2.data || {};

        const id = response2Json.id || '';

        const uuid = `https://replicate.com/api/predictions/${id}`;
        while (true) {
            const imurlResponse = await axios.get(uuid, { headers: headers2 });
            const data = imurlResponse.data || {};

            if (data.completed_at !== undefined) {
                const result = { output: data.output ? data.output[0] : '' };
                console.log("Prediction result:", result);
                return res.json(result);
            } else {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } catch (err) {
        console.log("Error:", err.toString());
        return res.json({ error: err.toString() });
    }
});

app.listen(5000, () => {
    console.log('Server is running on port 5000');
});
