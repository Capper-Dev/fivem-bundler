fx_version 'cerulean'
game 'gta5'

shared_script '@ox_lib/init.lua'

client_script 'main_client.lua'

server_scripts {
  'main_server.lua',
  'utils.lua',
}
