#!/usr/bin/ruby
# -*- coding: UTF-8 -*-
require "discourse_api"
require "yaml"
require 'find'

@client_config = YAML.load(File.open("config.yml"))

@client = DiscourseApi::Client.new(@client_config["website_url"])
@client.api_key = @client_config["api_key"]
@client.api_username = @client_config['api_username']

def make_post(raw_str)
    @client.create_post({
        topic_id: @client_config["main_topic_id"],
        raw: raw_str
    })
end

shuoshuo_lib = YAML.load(File.open("./lib/new.yml"))

shuoshuo_lib.each do |shuoshuo|
    need_str = ''
    need_str << shuoshuo['content']
    shuoshuo['rt_con'] and need_str << "\n[quote]\n #{shuoshuo['rt_con']['content']} \n[/quote]\n"
    shuoshuo['pic'] and shuoshuo['pic'].each do |pic| 
        need_str << "\n![](#{pic['smallurl']})\n"
    end
    puts need_str
    puts "-----------"
    
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
    rescue Exception => e  
        puts "Failed: "
        puts e.message  
        puts e.backtrace.inspect 
        puts "-----------"

        total_try = total_try + 1
        if total_try > 3
            puts "失败"
        else
            puts "wait 5 sec again..."
            sleep(5)
            retry
        end
    end
    
    puts "sleep #{@client_config["wait_sec"]} sec for next..."
    

    sleep(@client_config["wait_sec"])
end


puts "OK."