module source where

data N : Set where
  z : N
  s : N -> N

_+_ : N -> N -> N
z + b = b
s a + b = s (a + b)

_*_ : N -> N -> N
z * b = z
s a * b = b + (a * b)

ten : N
ten = s (s (s (s (s (s (s (s (s (s z)))))))))

a : N
a = {! ten * (ten * ten) !}

b : N
b = {! s s !}
