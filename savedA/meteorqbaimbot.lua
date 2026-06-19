local players = game:GetService("Players")
local camera = workspace.CurrentCamera
local coreGui = game:GetService("CoreGui")

local player = players.LocalPlayer
local playerGui = player.PlayerGui

local targets = {}
local opps = {}

local highlight = Instance.new("Highlight")
highlight.FillColor = Color3.fromRGB(170, 0, 238)
highlight.Parent = coreGui

local findTarget = function()
    table.clear(targets)
    table.clear(opps)

    local closestDistance = math.huge
    local closestTarget = nil
    
    for _, plr in next, players:GetPlayers() do
        if plr == player then continue end
        if plr.Team == player.Team then
            targets[#targets + 1] = plr
        else
            opps[#opps + 1] = plr
        end
    end
    
    if workspace:FindFirstChild("npcwr") then
        targets[#targets + 1] = workspace.npcwr.a["bot 1"]
        opps[#opps + 1] = workspace.npcwr.a["bot 2"]
        targets[#targets + 1] = workspace.npcwr.b["bot 3"]
        opps[#opps + 1] = workspace.npcwr.b["bot 4"]
    end
    
    local mousePos = game:GetService("UserInputService"):GetMouseLocation()
    
    for _, v in next, targets do
        local character
        
        if typeof(v) == "Instance" and v:IsA("Player") then
            character = v.Character
        else
            character = v
        end
        if not character then continue end
        
        local hrp = character:FindFirstChild("HumanoidRootPart") 
            or character:FindFirstChildWhichIsA("BasePart")
        if not hrp then continue end
        
        local screenPos, onScreen = camera:WorldToViewportPoint(hrp.Position)
        if not onScreen then continue end
        
        local dist = (Vector2.new(screenPos.X, screenPos.Y) - Vector2.new(mousePos.X, mousePos.Y)).Magnitude
        if dist < closestDistance then
            closestDistance = dist
            closestTarget = character
        end
    end

    return closestTarget
end

task.spawn(function()
    while true do
        task.wait()
        
        local character = player.Character
        if not character then continue end
        
        local football = character:FindFirstChild("Football")
        local ballGui = playerGui:FindFirstChild("BallGui")
        
        if not football or not ballGui then
            highlight.Enabled = false
            continue
        end
        
        local target = findTarget()
        if not target then
            highlight.Enabled = false
            continue
        end
        
        highlight.Enabled = true
        highlight.Adornee = target
        highlight.Parent = coreGui
    end
end)