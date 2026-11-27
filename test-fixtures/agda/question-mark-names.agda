module source where

data Bool : Set where
  true false : Bool

is? : Bool -> Bool
is? b = b

f : Bool -> Bool
f b = {! is? b !}

not? : Bool -> Bool
not? b = {! b !}
