import axios from "axios";
import yaml from "js-yaml";

/**
 * =====配置区=======
 */

// 要爬取的好友id
let targetQQ = '';
// cookie，请通过 https://i.qq.com/ 登陆后手动获取...
let cookie = '';
// 单次爬取数量
let singleNum = 20;
// 爬取数量上限
let limitCount = 100;
// 调试模式
let debugMode = false;
// 每条说说要保留的信息
let keepInfo = ['content', 'created_time', 'createTime', 'rt_con', 'name', 'pic', 'tid'];
// 是否自动下载图片
let autoDownloadPic = true;
// 图片下载目录
let picDir = './pic';

/**
 * =====函数区=======
 */

// 将cookie转换为对象
function cookieToObject(cookie: string) {
    const cookieObject: any = {};
    const cookieArray = cookie.split('; ');
    cookieArray.forEach((item) => {
        const [key, value] = item.split('=');
        cookieObject[key] = value;
    });
    return cookieObject;
}
// get_g_tk
function getGTK(skey: string) {
    let hash = 5381;
    for (let i = 0, len = skey.length; i < len; ++i) {
        hash += (hash << 5) + skey.charCodeAt(i);
    }
    return hash & 0x7fffffff;
}
// 获取好友空间说说的json文件
async function getShuoshuo(qq: string, g_tk: number, cookie: string, pos: number, num: number = 20) {
    const url = `https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?uin=${qq}&ftype=0&sort=0&pos=${pos}&num=${num}&replynum=100&g_tk=${g_tk}&callback=_preloadCallback&code_version=1&format=jsonp&need_private_comment=1`;
    const res = await axios.get<string>(url, {
        headers: {
            cookie,
        },
    });
    const data = res.data.substring(17, res.data.length - 2);
    return JSON.parse(data);
}
// 获取指定tid说说的content
async function getShuoshuoInfo(qq: string, g_tk: number, cookie: string, tid: string) {
    const url = `https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msgdetail_v6?uin=${qq}&tid=${tid}&ftype=0&sort=0&pos=0&num=20&replynum=100&g_tk=${g_tk}&callback=_preloadCallback&code_version=1&format=jsonp&need_private_comment=1&not_trunc_con=1`;
    const res = await axios.get<string>(url, {
        headers: {
            cookie,
        },
    });
    const data = res.data.substring(17, res.data.length - 2);
    return JSON.parse(data);
}
// 读取本地json
function readJson(path: string) {
    const fs = require('fs');
    const data = fs.readFileSync(path, 'utf-8');
    return JSON.parse(data);
}
// 将json写入本地
function writeJson(path: string, data: any) {
    const fs = require('fs');
    fs.writeFileSync(path, JSON.stringify(data));
}
// 写入yml
function writeYml(path: string, data: any) {
    const fs = require('fs');
    fs.writeFileSync(path, yaml.dump(data));
}
// 下载文件到指定目录
async function downloadFile(url: string, path: string, fileName: string) {
    const fs = require('fs');
    // 先判断目录是否存在，不存在则创建
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
    const writer = fs.createWriteStream(path + '/' + fileName);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}


/**
 * =====Main=======
 */

// 获取本地存储的json文件（历史说说数据库）
let historyJson: any;
try {
    historyJson = readJson('./lib/data.json');
} catch (e) { }
if (!historyJson) {
    historyJson = {};
    console.log('不存在历史说说数据库(´。＿。｀)');
}
// 获取配置文件（config.json）
let configJson: any;
try {
    configJson = readJson('./lib/config.json');
} catch (e) { }
if (configJson) {
    targetQQ = configJson.targetQQ ?? targetQQ;
    cookie = configJson.cookie ?? cookie;
    singleNum = configJson.singleNum ?? singleNum;
    limitCount = configJson.limitCount ?? limitCount;
    debugMode = configJson.debugMode ?? debugMode;
    keepInfo = configJson.keepInfo ?? keepInfo;
    autoDownloadPic = configJson.autoDownloadPic ?? autoDownloadPic;
    picDir = configJson.picDir ?? picDir;
} else {
    console.log('不存在config.json(´。＿。｀)，将使用默认配置...');
}
// 将cookie转换为对象
const cookieObject = cookieToObject(cookie);
if (debugMode) {
    console.log('cookieObject', cookieObject);
}
// 获取skey
const skey = cookieObject.skey;
// 获取g_tk
const g_tk = getGTK(skey);
if (debugMode) {
    console.log('g_tk', g_tk);
}
// 爬取好友的最新说说，与本地数据库进行比对，如果有新说说则写入本地数据库
async function main() {
    let pos = 0, newArray = [];
    try {
        while (true) {
            // 获取好友空间说说的json文件
            console.log(`正在爬取第 ${pos} 到第 ${pos + singleNum} 条说说...`);
            const data = await getShuoshuo(targetQQ, g_tk, cookie, pos, singleNum);
            if (debugMode) {
                console.log(data);
            }
            // 获取好友空间说说的json文件中的说说列表
            const shuoshuoList = data.msglist;
            if (!shuoshuoList) {
                if (data.code === -3000) {
                    console.log('cookie已失效，请重新获取cookie(´。＿。｀)');
                } else {
                    console.log('好友空间没有对我开放...呜呜呜');
                }
                return;
            }
            // 遍历说说列表
            for (let i = 0; i < shuoshuoList.length; i++) {
                // 获取当前说说的id
                const currentShuoshuoId = shuoshuoList[i].tid;
                // 如果当前说说的id不在本地数据库中，则将当前说说写入本地数据库
                if (!historyJson[currentShuoshuoId]) {
                    const current: { [k: string]: any } = shuoshuoList[i];
                    // 如果说说content字数超过400字，则可能被截断，需要重新获取完整的content
                    for (let resume_time = 0; resume_time < 3;) {
                        try {
                            if (current.content.length > 400) {
                                console.log(`正在获取说说 ${currentShuoshuoId} 的完整内容...`);
                                const content = (await getShuoshuoInfo(targetQQ, g_tk, cookie, current.tid)).content;
                                current.content = content;
                            }
                            break;
                        } catch (e) {
                            console.log(`捕获到异常信息(´。＿。｀)：${e}`);
                            console.log('============================');
                            console.error(e);
                            console.log('============================');
                            console.log(`已尝试过 ${resume_time} 次，2秒后尝试重试……`);
                            
                            const a = Number(new Date());
                            while ((Number(new Date()) - a) < 2000);
                        }
                    }
                    
                    
                    // 引用的说说同理
                    for (let resume_time = 0; resume_time < 3;) {
                        try {
                            if (current.rt_con && current.rt_con.content.length > 400) {
                                console.log(`正在获取说说 ${currentShuoshuoId} 的完整引用内容...`);
                                const content = (await getShuoshuoInfo(targetQQ, g_tk, cookie, current.rt_tid)).content;
                                current.rt_con.content = content;
                            }
                            break;
                        } catch (e) {
                            console.log(`捕获到异常信息(´。＿。｀)：${e}`);
                            console.log('============================');
                            console.error(e);
                            console.log('============================');
                            console.log(`已尝试过 ${resume_time} 次，2秒后尝试重试……`);
                            
                            const a = Number(new Date());
                            while ((Number(new Date()) - a) < 2000);
                        }
                    }
                    
                    // 如果设置了自动下载图片
                    if (autoDownloadPic) {
                        // 获取图片列表
                        const picList = current.pic;
                        if (picList) {
                            console.log(`正在下载说说 ${currentShuoshuoId} 的图片...共 ${current.pic.length} 张`);
                            // 遍历图片列表
                            for (let j = 0; j < picList.length; j++) {
                                console.log(`这是第 ${j} 张`);
                                // 错误处理
                                for (let resume_time = 0; resume_time < 3;) {
                                    try {
                                        // 获取图片的url
                                        const picUrl = picList[j].url1 ?? picList[j].url2 ?? picList[j].url3 ?? picList[j].pic_id;
                                        // 获取图片的文件名
                                        const picName = `${currentShuoshuoId}-${j}.jpg`;
                                        // 下载图片
                                        await downloadFile(picUrl, picDir, picName);
                                        // 将图片的url替换为本地路径
                                        picList[j] = {
                                            oriUrl: picUrl,
                                            localPath: `${picDir}/${picName}`
                                        }
                                        break;
                                    } catch (e) {
                                        console.log(`捕获到异常信息(´。＿。｀)：${e}`);
                                        console.log('============================');
                                        console.error(e);
                                        console.log('============================');
                                        console.log(`已尝试过 ${resume_time} 次，2秒后尝试重试……`);
                                        
                                        const a = Number(new Date());
                                        while ((Number(new Date()) - a) < 2000);
                                    }
                                }
                            }
                        }
                    }
                    // 精简
                    let shortVer: { [k: string]: any } = {};
                    for (let key of keepInfo) {
                        if (current[key]) {
                            shortVer[key] = current[key];
                        }
                    }
                    historyJson[currentShuoshuoId] = shortVer;
                    newArray.push(shortVer);
                }
            }
            // pos递增
            pos += singleNum;
            // 如果爬取数量超过上限，则跳出循环
            if (pos >= limitCount) {
                break;
            }
        }
        
    } catch (e) {
        console.log(`捕获到致命错误(っ °Д °;)：${e}`);
        console.log('============================');
        console.error(e);
        console.log('============================');

        // 备份一遍过去的json
        const nowdate = new Date();
        writeJson(`./lib/data-${nowdate.toDateString()}-backup.json`, readJson('./lib/data.json'))
        console.log(`已备份./lib/data.json到./lib/data-${nowdate.toDateString()}-backup.json~( •̀ ω •́ )y`);
        writeJson(`./lib/new-${nowdate.toDateString()}-backup.json`, readJson('./lib/new.json'))
        console.log(`已备份./lib/new.json到./lib/new-${nowdate.toDateString()}-backup.jsom~( •̀ ω •́ )y`);
        writeYml(`./lib/new-${nowdate.toDateString()}-backup.yml`, readJson('./lib/new.json'));
        console.log(`已备份./lib/new.yml到./lib/new-${nowdate.toDateString()}-backup.yml~( •̀ ω •́ )y`);

    }
    // 顶级catch
    // 无论如何，把这次爬下来的写上库里
    // 新说说数组排序
    
    newArray.sort((a, b) => a.created_time - b.created_time);
    if (debugMode) {
        console.log('newArray', newArray);
    }
    // 将本地数据库写入本地
    writeJson('./lib/data.json', historyJson);
    writeJson('./lib/new.json', newArray);

    // 写入YML
    writeYml('./lib/new.yml', newArray);

    console.log(`爬取完毕，共爬取${newArray.length}条新说说~🥰`);
    console.log(`已更新到./lib/data.json~`);
    console.log(`新说说已更新到./lib/new.json~`);
    console.log(`新说说已更新到./lib/new.yml~`);
}
main();