local ped = PlayerPedId()
local state = Entity(ped)?.state
local health = state?.health

local counter = 0
counter += 1
counter -= 1
counter *= 2
counter /= 2

local hash = `weapon_pistol`

/* This is a C-style comment */

print(health)
