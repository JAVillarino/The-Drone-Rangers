from dataclasses import dataclass

@dataclass
class Point:
    x: int
    y: int

@dataclass
class Circle:
    center: Point
    radius: float

@dataclass
class Rectangle:
    top_left: Point
    bottom_right: Point

def describe_shape(shape):
    match shape:
        case Point(x, y):
            print(f"It's a Point at ({x}, {y})")
        case Circle(center=Point(cx, cy), radius=r):
            print(f"It's a Circle with center at ({cx}, {cy}) and radius {r}")
        case Rectangle(top_left=Point(tx, ty), bottom_right=Point(bx, by)):
            print(f"It's a Rectangle from ({tx}, {ty}) to ({bx}, {by})")
        case _:
            print("Unknown shape")

# Example usage
p = Point(1, 2)
c = Circle(Point(0, 0), 5.0)
r = Rectangle(Point(0, 10), Point(5, 0))

describe_shape(p)
describe_shape(c)
describe_shape(r)