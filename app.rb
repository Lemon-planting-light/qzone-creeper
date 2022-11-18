#!/usr/bin/ruby
# -*- coding: UTF-8 -*-
require "discourse_api"
require "yaml"
require 'find'

@client_config = YAML.load(File.open("config.yml"))

@client = DiscourseApi::Client.new(@client_config["website_url"])
@client.api_key = @client_config["api_key"]
@client.api_username = @client_config['api_username']

count_all = 0
@failed_log = []

def make_post(raw_str)
    @client.create_post({
        topic_id: @client_config["main_topic_id"],
        raw: raw_str
    })
end

def upload_pic(pic_path)
    f = {}
    total_try = 0
    begin
        f = @client.upload_file({
            file: Faraday::UploadIO.new(pic_path, "application/jpg")
        })
    rescue Exception => e  
        puts "上传图片时失败o(TヘTo): "
        puts e.message  
        puts e.backtrace.inspect 
        puts "-----------"

        total_try = total_try + 1
        if total_try > 3
            puts "连续失败 #{total_try} 次，系统不再重试(´。＿。｀)"
            @failed_log << {
                name: pic_path,
                info: e.message,
                inspect: e.backtrace.inspect       
            }
            sleep(1)
        else
            puts "等待5秒后重试..."
            sleep(5)
            retry
        end
    end
    return f["short_url"]
end

# 加载说说库
begin
    shuoshuo_lib = YAML.load(File.open("./lib/new.yml"))
rescue
    puts "致命错误：加载说说库时出错"
end

# 对每条说说进行处理
shuoshuo_lib.each do |shuoshuo|
    need_str = ''
    # 传入说说主要内容
    need_str << shuoshuo['content']
    # 添加引用（转发说说）信息
    shuoshuo['rt_con'] and need_str << "\n[quote=#{@client_config['api_username']}]\n #{shuoshuo['rt_con']['content']} \n[/quote]\n"
    
    puts "已获得说说【#{need_str[0..10]}...】的主体："
    puts "----------"
    # 进行一个图片的上传
    pic_count = 0
    shuoshuo['pic'] and shuoshuo['pic'].each do |pic| 
        pic_count = pic_count + 1
        picurl = nil
        # 已下载到本地
        if pic['localPath'] 
            puts "上传图片#{pic_count}中……"
            picurl = upload_pic(pic['localPath'])
            puts "上传成功，获得url: #{picurl} 等待2秒以进行下次上传"
            sleep(2)
        end
        # 未下载到本地
        if !picurl
            picurl or pic['smallurl'] and picurl = pic['smallurl']
            picurl or pic['oriUrl'] and picurl = pic['oriUrl']
            picurl or pic['url1'] and picurl = pic['url1']
            picurl or pic['url2'] and picurl = pic['url2']
            picurl or pic['url3'] and picurl = pic['url3']
        end
        picurl and need_str << "\n![](#{picurl})\n"
    end

    puts "-----帖子内容构建完毕------"
    puts need_str
    puts "------开始发帖到论坛-------"
    
    total_try = 0
    begin
        if shuoshuo["created_time"]
            @client.create_post({
                topic_id: @client_config["main_topic_id"],
                raw: need_str,
                created_at: Time.at(shuoshuo["created_time"]).to_s
            })
        else
            make_post(need_str)
        end
        count_all = count_all + 1
    rescue Exception => e  
        puts "上传post时失败(⊙_⊙)？："
        puts e.message  
        puts e.backtrace.inspect 
        puts "-----------"

        total_try = total_try + 1
        if total_try > 3
            puts "连续失败 #{total_try} 次，系统不再重试(´。＿。｀)"
            @failed_log << {
                classname: "post",
                info: e.message,
                inspect: e.backtrace.inspect,
                created_at: Time.at(shuoshuo["created_time"]).to_s,
                details: need_str
            }
            sleep(1)
        else
            puts "等待5秒后重试..."
            sleep(5)
            retry
        end
    end
    
    puts "该上传任务已完成；请等待 #{@client_config["wait_sec"]}秒 以传输下一个..."
    sleep(@client_config["wait_sec"])
end


puts "ALL OK. 已上传 #{count_all} 个帖子。共计失败数: #{@failed_log.length}"

if @failed_log.length > 0
    log_file = File.new('failed.log', 'w')
    log_file.syswrite(YAML.dump(@failed_log))

    puts "查看 failed.log 以获取更多细节。"
end