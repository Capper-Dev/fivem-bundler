local playerState = Player(source)?.state
local name = playerState?.name

RegisterNetEvent("test:event", function()
  print(name)
end)
