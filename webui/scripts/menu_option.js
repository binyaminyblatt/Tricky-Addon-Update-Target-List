import { exec, spawn, toast } from 'kernelsu-alt';
import { basePath, showPrompt, refreshAppList } from './main.js';
import { openFileSelector } from './file_selector.js';

// Function to check or uncheck all app
function toggleCheckboxes(shouldCheck) {
    document.querySelectorAll("md-checkbox").forEach(checkbox => {
        const card = checkbox.closest(".card");
        if (card && card.style.display !== "none") {
            checkbox.checked = shouldCheck;
            card.classList.toggle('selected', shouldCheck);
        }
    });
}

// Close menu on button click
document.querySelector('.menu-item-button-container').addEventListener('click', (e) => {
    document.getElementById('menu-options').close();
});

// Function to select all visible apps
document.getElementById("select-all").onclick = () => toggleCheckboxes(true);

// Function to deselect all visible apps
document.getElementById("deselect-all").onclick = () => toggleCheckboxes(false);

// Function to read the denylist and check corresponding apps
document.getElementById("select-denylist").onclick =  () => {
    exec(`magisk --denylist ls 2>/dev/null | awk -F'|' '{print $1}' | grep -v "isolated" | sort -u`)
        .then(({ errno, stdout }) => {
            if (errno === 0) {
                const denylistApps = stdout.split("\n").map(app => app.trim()).filter(Boolean);
                document.querySelectorAll(".card").forEach(app => {
                    const packageName = app.getAttribute("data-package");
                    if (denylistApps.includes(packageName)) {
                        app.querySelector("md-checkbox").checked = true;
                        app.classList.add('selected');
                    }
                });
                exec('touch "/data/adb/tricky_store/target_from_denylist"');
            } else {
                toast("Failed to read DenyList!");
            }
        });
}

// Function to read the exclude list and uncheck corresponding apps
document.getElementById("deselect-unnecessary").onclick = async () => {
    try {
        const excludeList = await fetch("https://raw.githubusercontent.com/KOWX712/Tricky-Addon-Update-Target-List/main/more-exclude.json")
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .catch(async () => {
                return fetch("https://hub.gitmirror.com/raw.githubusercontent.com/KOWX712/Tricky-Addon-Update-Target-List/main/more-exclude.json")
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        return response.json();
                    });
            })
            .then(data => {
                return data.data
                    .flatMap(category => category.apps)
                    .map(app => app['package-name'])
                    .join('\n');
            })
            .catch(error => {
                toast("Failed to download unnecessary apps!");
                throw error;
            });
        exec(`sh ${basePath}/common/get_extra.sh --xposed`)
            .then(({ stdout }) => {
                const unnecessaryApps = excludeList.split("\n").map(app => app.trim())
                    .filter(Boolean).concat(stdout.split("\n").map(app => app.trim()).filter(Boolean));
                document.querySelectorAll(".card").forEach(app => {
                    const packageName = app.getAttribute("data-package");
                    if (unnecessaryApps.includes(packageName)) {
                        app.querySelector("md-checkbox").checked = false;
                        app.classList.remove('selected');
                    }
                });
            });
    } catch (error) {
        toast("Failed to get unnecessary apps!");
        console.error("Failed to get unnecessary apps:", error);
    }
}

// Function to add system app
export async function setupSystemAppMenu() {
    const dialog = document.getElementById('add-system-app-dialog');
    document.getElementById("add-system-app").onclick = () => {
        renderSystemAppList();
        dialog.show();
    }

    // Add system app button
    document.getElementById("add-system-app-button").onclick = async () => {
        const input = document.getElementById("system-app-input");
        const packageName = input.value.trim();
        if (packageName) {
            exec(`pm list packages -s | grep -q ${packageName}`)
                .then(({ errno }) => {
                    if (errno !== 0) {
                        showPrompt("prompt_system_app_not_found", false);
                    } else {
                        exec(`
                            touch "/data/adb/tricky_store/system_app"
                            echo "${packageName}" >> "/data/adb/tricky_store/system_app"
                            echo "${packageName}" >> "/data/adb/tricky_store/target.txt"
                        `)
                        input.value = "";
                        dialog.close();
                        refreshAppList();
                    }
                });
        }
    }

    document.getElementById('cancel-add-system-app').onclick = () => dialog.close();

    // Display current system app list and remove button
    async function renderSystemAppList() {
        const systemAppList = document.querySelector(".current-system-app-list");
        const systemAppListContent = document.querySelector(".current-system-app-list-content");
        systemAppListContent.innerHTML = "";
        const { errno, stdout } = await exec(`[ -f "/data/adb/tricky_store/system_app" ] && cat "/data/adb/tricky_store/system_app" | sed '/^#/d; /^$/d'`);
        if (errno !== 0 || stdout.trim() === "") {
            systemAppList.style.display = "none";
        } else {
            stdout.split("\n").forEach(app => {
                if (app.trim() !== "") {
                    systemAppListContent.innerHTML += `
                        <div class="system-app-item">
                            <span>${app}</span>
                            <md-filled-icon-button class="remove-system-app-button">
                                <md-icon>delete</md-icon>
                            </md-filled-icon-button>
                        </div>
                    `;
                }
            });
        }

        // Remove button listener
        document.querySelectorAll(".remove-system-app-button").forEach(button => {
            button.onclick = () => {
                const app = button.closest(".system-app-item").querySelector("span").textContent;
                exec(`
                    sed -i "/${app}/d" "/data/adb/tricky_store/system_app"
                    sed -i "/${app}/d" "/data/adb/tricky_store/target.txt"
                `).then(() => {
                    dialog.close();
                    refreshAppList();
                });
            }
        });
    }
}

// Override default behaviour
document.querySelectorAll('.sub-menu-entry').forEach(entry => {
    const menu = entry.parentElement;
    entry.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.open ? menu.close() : menu.show();
    });
    menu.querySelector('md-menu').addEventListener('opening', () => menu.open = true);
    menu.querySelector('md-menu').addEventListener('closing', () => menu.open = false);
});

/**
 * Backup previous keybox and set new keybox
 * @param {String} content - kb content to save
 * @returns {Promise<Boolean>}
 */
async function setKeybox(content) {
    const { errno } = await exec(`
        mv -f /data/adb/tricky_store/keybox.xml /data/adb/tricky_store/keybox.xml.bak 2>/dev/null
        cat << 'KB_EOF' > /data/adb/tricky_store/keybox.xml
${content}
KB_EOF
        chmod 644 /data/adb/tricky_store/keybox.xml
    `);
    return errno === 0;
}

/**
 * Set aosp key
 * @returns {Promise<void>}
 */
async function aospkb() {
    const { stdout } = await exec(`xxd -r -p ${basePath}/common/.default | base64 -d`);
    const result = await setKeybox(stdout);
    showPrompt(result ? "prompt_aosp_key_set" : "prompt_key_set_error", result);
}

// aosp kb eventlistener
document.getElementById("aospkb").onclick = aospkb;

/**
 * Fetch encoded keybox and decode
 * @param {String} link - link to fetch
 * @param {String} fallbackLink - fallback link
 * @returns {void}
 */
async function fetchkb(link, fallbackLink) {
    fetch(link)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.text();
        })
        .catch(async () => {
            return fetch(fallbackLink)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.text();
                });
        })
        .then(async (data) => {
            if (!data.trim()) {
                showPrompt("prompt_no_valid", false);
                return;
            }
            try {
                const hexBytes = new Uint8Array(data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                const decodedHex = new TextDecoder().decode(hexBytes);
                const source = atob(decodedHex);
                const result = await setKeybox(source);
                if (result) {
                    showPrompt("prompt_valid_key_set");
                } else {
                    throw new Error("Failed to copy valid keybox");
                }
            } catch (error) {
                throw new Error("Failed to decode keybox data");
            }
        })
        .catch(async error => {
            showPrompt("prompt_no_internet", false);
        });
}

async function fetchotherkb(link, type) {
    
    fetch(link)
    .then((response) => {
        if (!response.ok){
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
    })
    .then(async (data) => {
        if (!data.trim()) {
            showPrompt("prompt_no_valid", false);
            return;
        }
        try {
            switch (type) {
                case 'integrity': {
                    let text = data;
                    for (let i = 0; i < 10; i++) {
                        try {
                            text = atob(text);
                        } catch {
                            break;
                        }
                    }
                    text = text.replace(/[^0-9a-fA-F]/g, "");
                    let hexDecoded = "";
                    for (let i = 0; i < text.length; i += 2)
                        hexDecoded += String.fromCharCode(parseInt(text.substr(i, 2), 16));
                    let result = hexDecoded.replace(/[a-zA-Z]/g, (c) =>
                        String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < "n" ? 13 : -13))
                    );
                    const badWords = ["Words", "Can", "Describe", "The", "Human", "Race"];
                    result = result.replace(
                        new RegExp(`\\b(${badWords.join("|")})\\b`, "gi"),
                        ""
                    );
                    result = result.replace(
                        /<\/AndroidAttestation>\s*<\/AndroidAttestation>/g,
                        "</AndroidAttestation>"
                    );
                    data = result;
                    break;
                }
                case 'yurikeyold': {
                    data = atob(data);
                    break;
                }
                case 'yurikey': {
                    // Check if content is a shell script
                    const decoded = atob(data);
                    const shellMatch = decoded.match(/KEYBOX_BASE64_PAYLOAD=["']([^"']+)["']/);
                    if (!shellMatch) {
                        throw new Error("Cant find keybox payload");
                    }
                    data = atob(shellMatch[1]);
                    break;
                }
                default:
                    throw new Error("Unknown keybox type");
            }
            
            // Validate XML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(data, "application/xml");
            const parserError = xmlDoc.getElementsByTagName("parsererror");
            if (parserError.length > 0) {
                console.error("Invalid keybox XML", parserError[0].textContent);
                showPrompt("prompt_key_invalid_xml", false);
                return;
            }

            const source = data;
            const result = await setKeybox(source);
            if (result) {
                showPrompt("prompt_valid_key_set");
            } else {
                throw new Error("Failed to copy valid keybox");
            }
        } catch (error) {
            throw new Error("Failed to decode keybox data");
        }
    })
    .catch(async (error) => {
        showPrompt("prompt_no_internet", false);
    });
}

async function buildIntegrityUrlFromGithub(scriptUrl) {
    const res = await fetch(scriptUrl);
    if (!res.ok) throw new Error("Failed to fetch script");

    const script = await res.text();
    const lines = script.split("\n");

    // Step 1: Find the printf line with | Z
    const printfLine = lines.find(line => line.includes("| Z"));
    if (!printfLine) throw new Error("No printf line with Z found");

    // Step 2: Extract variable names inside $() in printf
    const varMatch = printfLine.match(/\$[A-Za-z0-9_]+/g);
    if (!varMatch) throw new Error("No variables found in printf");

    const varNames = varMatch.map(v => v.slice(1)); // remove $

    // Step 3: Map variable names to their values
    const varMap = {};
    for (const line of lines) {
        const m = line.match(/^([A-Za-z0-9_]+)=(["'])(.*)\2$/);
        if (m) varMap[m[1]] = m[3];
    }

    // Step 4: Concatenate values in printf order
    let base64String = "";
    for (const name of varNames) {
        if (!(name in varMap)) throw new Error(`Variable ${name} not found`);
        base64String += varMap[name];
    }

    // Step 5: Decode once
    const url = atob(base64String);

    if (!url.startsWith("http")) throw new Error("Decoded URL is invalid");

    return url;
}

// unkown kb eventlistener
document.getElementById("devicekb").onclick = async () => {
    const output = spawn("sh", [`${basePath}/common/get_extra.sh`, "--unknown-kb"],
                    { cwd: "/data/local/tmp", env: { PATH: `${basePath}/common/bin:$PATH` }});
    output.on('exit', (code) => {
        showPrompt(code === 0 ? "prompt_unknown_key_set" : "prompt_key_set_error", code === 0);
    });
}

// valid kb eventlistener
document.getElementById("validkb").onclick = () => {
    fetchkb(
        "https://raw.githubusercontent.com/KOWX712/Tricky-Addon-Update-Target-List/main/.extra",
        "https://hub.gitmirror.com/raw.githubusercontent.com/KOWX712/Tricky-Addon-Update-Target-List/main/.extra"
    )
}

document.getElementById("integrityvalidkb").onclick = () => {
    fetchotherkb(
        buildIntegrityUrlFromGithub(
            "https://raw.githubusercontent.com/MeowDump/Integrity-Box/6d3e243b0f5676c57fc77b8c5351a74357eec3cc/webroot/common_scripts/key.sh"
        ),
        "integrity"
    );
};

document.getElementById("yurikeyoldvalidkb").onclick = () => {
    fetchotherkb(
        "https://raw.githubusercontent.com/Yurii0307/yurikey/refs/heads/main/key",
        "yurikeyold"
    );
};

document.getElementById("yurikeyvalidkb").onclick = () => {
    fetchotherkb(
        "https://raw.githubusercontent.com/Yurii0307/yurikey/refs/heads/main/conf",
        "yurikey"
    );
};


// Open custom keybox selector
document.getElementById('customkb').onclick = async () => {
    try {
        const content = await openFileSelector('xml');
        const result = await setKeybox(content);
        showPrompt(result ? "prompt_custom_key_set" : "prompt_key_set_error", result);
    } catch (error) {
        showPrompt("prompt_key_set_error", false);
    }
}

// Instruction menu
const helpDialog = document.getElementById('help-dialog');
document.getElementById('help').onclick = () => helpDialog.show();
document.getElementById('close-help').onclick = () => helpDialog.close();
